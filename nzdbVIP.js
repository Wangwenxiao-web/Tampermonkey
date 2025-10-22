// ==UserScript==
// @name         API AES 拦截 + 重写响应（增强版）
// @namespace    http://tampermonkey.net/
// @version      2025-10-22-v2
// @description  拦截 getUserInfo 接口，支持早期注入、Store 热修复、延迟加载保护
// @author       我
// @match        https://www.srnz.net/**
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const SCKEY = "2024102810025201";
  const TARGET_API = "api-nz/nz/getUserInfo";
  const MOCK_VERSION_INFO = {
    version: "pro",
    versionExpireTime: "2099-12-31 23:59:59",
    versionFunctions: ["no_ad"],
  };

  /* ========== 日志工具 ========== */
  function log(msg, data = null, color = "#00C853") {
    console.log(
      `%c[VIP-Patch] ${msg}`,
      `color:${color};font-weight:bold;`,
      data || ""
    );
  }

  /* ========== 加载 CryptoJS ========== */
  function loadCryptoJSIfNeeded(callback) {
    if (window.CryptoJS) return callback();
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js";
    script.onload = callback;
    script.onerror = () => console.error("[VIP-Patch] 加载 CryptoJS 失败");
    document.head.appendChild(script);
  }

  /* ========== AES 工具函数 ========== */
  function AESDecrypt(word) {
    const key = CryptoJS.enc.Utf8.parse(SCKEY);
    const resultByte = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(word) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    const utf8 = CryptoJS.enc.Utf8.stringify(resultByte);
    try {
      return JSON.parse(utf8);
    } catch {
      return utf8;
    }
  }

  function AESEncrypt(obj) {
    const word = typeof obj === "string" ? obj : JSON.stringify(obj);
    const key = CryptoJS.enc.Utf8.parse(SCKEY);
    const srcs = CryptoJS.enc.Utf8.parse(word);
    const resultByte = CryptoJS.AES.encrypt(srcs, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    return resultByte.toString();
  }

  /* ========== 方案1: 拦截 XHR 请求 ========== */
  function patchXHR() {
    const XHR = window.XMLHttpRequest;
    if (!XHR) return;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url, async, user, password) {
      this._intercept_url = url;
      return origOpen.apply(this, arguments);
    };

    XHR.prototype.send = function (body) {
      const handleStateChange = () => {
        if (
          this.readyState === 4 &&
          this._intercept_url?.includes(TARGET_API)
        ) {
          try {
            let input = this.responseText.trim();
            if (input.startsWith('"') && input.endsWith('"')) {
              input = input.slice(1, -1);
            }
            const data = AESDecrypt(input);

            if (data?.data) {
              // 修改会员信息
              Object.assign(data.data, MOCK_VERSION_INFO);

              const newCipher = AESEncrypt(data);

              // 覆盖响应
              Object.defineProperty(this, "responseText", {
                value: newCipher,
                writable: false,
                configurable: true,
              });
              Object.defineProperty(this, "response", {
                value: newCipher,
                writable: false,
                configurable: true,
              });

              log("✅ XHR 拦截成功", {
                原始: data.data,
                修改后: MOCK_VERSION_INFO,
              });

              // 同时触发 Store 热修复（双重保障）
              setTimeout(() => patchVuexStore(), 500);
            }
          } catch (err) {
            console.error("[VIP-Patch] XHR 拦截失败:", err);
          }
        }
      };

      if (this.addEventListener) {
        this.addEventListener("readystatechange", handleStateChange);
      } else {
        const orig = this.onreadystatechange;
        this.onreadystatechange = function () {
          handleStateChange();
          if (orig) orig.apply(this, arguments);
        };
      }

      return origSend.apply(this, arguments);
    };

    log("✅ XHR 拦截器已注入");
  }

  /* ========== 方案2: 拦截 Fetch 请求 ========== */
  function patchFetch() {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      const url = args[0];

      if (typeof url === "string" && url.includes(TARGET_API)) {
        const clonedResponse = response.clone();
        try {
          let text = await clonedResponse.text();
          if (text.startsWith('"') && text.endsWith('"')) {
            text = text.slice(1, -1);
          }
          const data = AESDecrypt(text);

          if (data?.data) {
            Object.assign(data.data, MOCK_VERSION_INFO);
            const newCipher = AESEncrypt(data);

            log("✅ Fetch 拦截成功", MOCK_VERSION_INFO);

            // 返回修改后的响应
            return new Response(newCipher, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          }
        } catch (err) {
          console.error("[VIP-Patch] Fetch 拦截失败:", err);
        }
      }

      return response;
    };

    log("✅ Fetch 拦截器已注入");
  }

  /* ========== 方案3: 直接修改 Vuex Store（热修复）========== */
  function patchVuexStore() {
    try {
      // 查找 Vue 实例
      const vueApp = document.querySelector("#app")?.__vue__;
      if (!vueApp?.$store) {
        // 未找到，稍后重试
        return false;
      }

      const store = vueApp.$store;
      const currentState = store.getters["user/getState"];

      // 如果已经是会员状态，跳过
      if (currentState?.versionInfo?.versionFunctions?.includes("no_ad")) {
        log("ℹ️ Store 已是会员状态，跳过修改");
        return true;
      }

      // 直接修改 Store
      store.commit("user/SET_VERSION_INFO", MOCK_VERSION_INFO);

      log("✅ Vuex Store 热修复成功", MOCK_VERSION_INFO, "#FF6D00");

      // 触发页面刷新（如果有 adStatus 方法）
      const currentComponent = vueApp.$children?.[0];
      if (currentComponent?.adStatus) {
        currentComponent.adStatus();
        log("✅ 触发 adStatus 刷新");
      }

      return true;
    } catch (err) {
      console.error("[VIP-Patch] Store 修改失败:", err);
      return false;
    }
  }

  /* ========== 方案4: 轮询等待 Vue 加载完成 ========== */
  function waitForVueAndPatch() {
    let attempts = 0;
    const maxAttempts = 50; // 最多等待 10 秒

    const timer = setInterval(() => {
      attempts++;

      if (patchVuexStore()) {
        clearInterval(timer);
        log(`✅ Vue 加载完成，Store 已修复 (尝试 ${attempts} 次)`);
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
        log("⚠️ Vue 加载超时，Store 修复失败", null, "#FF5722");
      }
    }, 200);
  }

  /* ========== 方案5: 延迟页面主脚本加载（阻止竞态）========== */
  function delayMainScripts() {
    // 拦截 pack1.js 和 pack2.js 的加载
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.tagName === "SCRIPT" && node.src) {
            const src = node.src;
            // 如果是主脚本文件，延迟加载
            if (src.includes("pack1.js") || src.includes("pack2.js")) {
              node.type = "javascript/blocked"; // 阻止执行
              log(`⏸️ 延迟加载: ${src}`, null, "#FFA000");

              // 等待 CryptoJS 和拦截器准备好后再执行
              setTimeout(() => {
                node.type = "text/javascript"; // 恢复执行
                log(`▶️ 恢复加载: ${src}`, null, "#00C853");
              }, 300);
            }
          }
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    log("✅ 脚本延迟加载器已启用");
  }

  /* ========== 主流程 ========== */
  function init() {
    log("🚀 VIP Patch 启动中...");

    // 立即注入拦截器（document-start 时机）
    loadCryptoJSIfNeeded(() => {
      patchXHR();
      patchFetch();

      // 等待 Vue 加载后修复 Store
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          waitForVueAndPatch();
        });
      } else {
        waitForVueAndPatch();
      }
    });

    // 可选：延迟主脚本加载（激进方案，可能影响页面性能）
    // delayMainScripts();
  }

  init();
})();
