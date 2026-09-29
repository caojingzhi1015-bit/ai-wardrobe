/* vision.js — 模型接入（OpenAI 兼容接口）
   用途：①视觉大模型给单品打标补全元数据 ②视觉大模型从穿搭照提炼风格画像 ③文本模型生成评估结论文案
   硬性要求：key 从设置里读，不写死；失败必须如实抛出原因，不允许假装成功。 */
(function (W) {
  'use strict';
  var U = W.utils, S = W.store;
  var V = (W.vision = {});

  function endpoint(base) {
    base = String(base || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('未配置 Base URL');
    if (/\/chat\/completions$/.test(base)) return base;
    return base + '/chat/completions';
  }

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('图片读取失败')); };
      fr.readAsDataURL(blob);
    });
  }

  function postJSON(url, apiKey, payload) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (apiKey || '')
      },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) {
          throw new Error('HTTP ' + r.status + '：' + (t.slice(0, 220) || r.statusText));
        }
        return t;
      });
    }).then(function (t) {
      try { return JSON.parse(t); } catch (e) {
        throw new Error('返回不是合法 JSON：' + t.slice(0, 160));
      }
    }).catch(function (e) {
      if (e && e.name === 'TypeError') throw new Error('请求被拦截（多为跨域 CORS 或网络不通）。请换一个允许浏览器直连的 Base URL，或暂时改用手动填写。');
      throw e;
    });
  }

  function chatOnce(base, key, model, messages, opts) {
    opts = opts || {};
    return postJSON(endpoint(base), key, {
      model: model,
      messages: messages,
      temperature: opts.temperature || 0.2,
      max_tokens: opts.maxTokens || 1200
    }).then(function (j) {
      var content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!content) {
        content = j && j.choices && j.choices[0] && j.choices[0].text;
      }
      if (!content) throw new Error('模型返回内容为空：' + JSON.stringify(j).slice(0, 200));
      return Array.isArray(content) ? content.map(function (c) { return c.text || ''; }).join('') : String(content);
    });
  }

  function extractJson(text) {
    var t = String(text).trim();
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    var s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s < 0 || e < 0) throw new Error('模型没返回 JSON 结构');
    try { return JSON.parse(t.slice(s, e + 1)); } catch (err) {
      throw new Error('JSON 解析失败：' + err.message);
    }
  }

  V.ready = function (which) {
    return S.settings().then(function (s) {
      if (which === 'llm') return !!(s.llmBaseUrl && s.llmApiKey && s.llmModel);
      return !!(s.visionBaseUrl && s.visionApiKey && s.visionModel);
    });
  };

  /* ---------- 单品打标（模块一第 3 步） ---------- */
  var TAG_SYSTEM = '你是电商服装商品信息结构化助手。只输出 JSON，不要解释，不要 markdown 代码块。' +
    '所有字段必须基于图片里真实可见的内容推断；图片看不出来的字段一律填字符串 "[待确认]"，严禁编造品牌与价格。';

  function tagPrompt(hint) {
    return '看图，把这件衣服/单品结构化成下面的 JSON：\n' +
      '{\n' +
      '  "name": "简短中文名，含颜色+版型+品类，如 藏青费尔岛提花开衫",\n' +
      '  "brand": "品牌，看不出填 [待确认]",\n' +
      '  "category": "top | outerwear | bottom | shoes | accessory 之一",\n' +
      '  "subcategory": "必须从这个集合里选一个：T恤/衬衫/卫衣/针织衫/背心/打底衫/夹克/大衣/羽绒服 \\/ 棉服/西装外套/马甲/防风外套/皮夹克/牛仔裤/西裤/休闲裤/工装裤/短裤/裙装/运动裤/运动鞋/靴子/皮鞋/凉鞋 \\/ 拖鞋/包/帽/围巾 \\/ 手套 \\/ 皮带 \\/ 墨镜 \\/ 首饰",\n' +
      '  "colorHex": "主色 #RRGGBB",\n' +
      '  "secondaryColorHex": "次要色 #RRGGBB，没有就 null",\n' +
      '  "material": "主材质，如 棉/羊毛/涤纶/帆布/皮革/牛仔/羊绒；看不出填 [待确认]",\n' +
      '  "season": ["从 春/夏/秋/冬 里选，可多选"],\n' +
      '  "occasion": ["从 通勤/休闲/约会/运动/旅行/居家 里选，可多选"],\n' +
      '  "aestheticTags": ["从 minimal/korean/lazy/workwear/clean-fit/street/vintage/preppy/techwear/outdoor 里选，可多选"],\n' +
      '  "tags": ["结构特征短标签，如 fair-isle/拉链/多口袋/落肩/重磅/绞花"],\n' +
      '  "notes": "图片上可见但不确定的地方，一句话说明；没有就空字符串"\n' +
      '}\n' +
      (hint ? '已知线索（来自文件名，可信度高，如冲突以图片为准）：' + hint + '\n' : '') +
      '如果图里有不止一件单品，只描述占据画面中心的那件，并在 notes 里写明"图中含多件，需拆分"。';
  }

  V.tagItem = function (imageBlob, hintId) {
    return S.settings().then(function (s) {
      if (!s.visionBaseUrl || !s.visionApiKey || !s.visionModel) {
        throw new Error('还没配置视觉模型（设置页填 Base URL / API Key / 模型名）');
      }
      return blobToDataURL(imageBlob).then(function (dataUrl) {
        return chatOnce(s.visionBaseUrl, s.visionApiKey, s.visionModel, [
          { role: 'system', content: TAG_SYSTEM },
          { role: 'user', content: [
            { type: 'text', text: tagPrompt(hintId) },
            { type: 'image_url', image_url: { url: dataUrl } }
          ] }
        ]);
      });
    }).then(extractJson);
  };

  /* ---------- 风格画像（模块二） ---------- */
  var PROFILE_SYSTEM = '你是个人穿搭档案分析师。只输出 JSON，不要解释，不要 markdown 代码块。' +
    '结论必须能被图片证据支持，宁可保守也不要臆断。';

  V.analyzeStyle = function (imageBlobs) {
    return S.settings().then(function (s) {
      if (!s.visionBaseUrl || !s.visionApiKey || !s.visionModel) {
        throw new Error('还没配置视觉模型（设置页填写后可用）');
      }
      return Promise.all(imageBlobs.map(blobToDataURL)).then(function (urls) {
        var content = [{ type: 'text', text:
          '下面是同一个人的若干张穿搭照片。跨图找共性，输出：\n' +
          '{\n' +
          '  "coreStyles": ["主导风格标签，英文或中文均可，2-4 个"],\n' +
          '  "colorPaletteHex": ["从照片里真实出现的主色 #RRGGBB，4-6 个"],\n' +
          '  "colorAvoidHex": ["按整体调性推断应该回避的颜色 #RRGGBB，可为空数组"],\n' +
          '  "silhouettePreference": "一句话描述廓形偏好（宽松/合身/紧身、是否有垂坠感）",\n' +
          '  "materialPreference": ["主要材质"],\n' +
          '  "patternPreference": ["纯色/条纹/格纹/印花等"],\n' +
          '  "avoidPatterns": ["看起来回避的元素"],\n' +
          '  "typicalOccasions": ["主要穿着场合"],\n' +
          '  "avoidList": ["从整体判断应回避的品类或元素"],\n' +
          '  "summary": "3-5 句大白话总结：这个人衣柜里大部分是……（不许用氛围感/调性这类空词）",\n' +
          '  "evidence": "你做出上述判断的图面依据，一句话"\n' +
          '}\n' +
          '如果样本太少看不出趋势，就在 summary 里明说样本不足，不要用想象填满字段。'
        }];
        urls.forEach(function (u) { content.push({ type: 'image_url', image_url: { url: u } }); });
        return chatOnce(s.visionBaseUrl, s.visionApiKey, s.visionModel, [
          { role: 'system', content: PROFILE_SYSTEM },
          { role: 'user', content: content }
        ], { maxTokens: 1600 });
      });
    }).then(extractJson);
  };

  /* ---------- 文本模型：给评估写人话结论（可选，不配置就用规则文案） ---------- */
  V.writeReportText = function (payload) {
    return S.settings().then(function (s) {
      if (!s.llmBaseUrl || !s.llmApiKey || !s.llmModel) throw new Error('未配置文本模型');
      return chatOnce(s.llmBaseUrl, s.llmApiKey, s.llmModel, [
        { role: 'system', content: '你是直给的私人买手顾问。说人话，每条理由必须落到具体事实（色值、廓形、材质、能搭的件数、季节数），不许说"见仁见智""看个人喜好"。输出中文。' },
        { role: 'user', content: '根据下面的结构化数据，写「买入建议」：\n' + JSON.stringify(payload, null, 2) + '\n\n' +
          '要求：\n1. 先给一句明确结论（推荐买 / 谨慎 / 不建议）；\n2. 用 3-5 条编号理由，每条一句话；\n3. 最后列「风险点」，没有就写"没有"。' }
      ]);
    });
  };
})(window.W = window.W || {});
