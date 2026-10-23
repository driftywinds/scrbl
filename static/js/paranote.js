(function () {
  // Supports configuration injected by a userscript
  const config = window.__paranoteConfig || {};
  const script = document.currentScript || {};

  console.log("ParaNote: Script loaded", config);

  const siteId = config.siteId || script.dataset?.siteId || "default-site";
  
  // Allow explicit empty string for relative paths
  let apiBase = config.apiBase;
  if (apiBase === undefined) {
      apiBase = script.getAttribute?.("data-api-base");
      if (apiBase === null) {
          apiBase = (script.src && new URL(script.src).origin.replace(/\/$/, "")) || "";
      }
  }
  
  // Use the userscript's GM_xmlhttpRequest when available, otherwise plain fetch
  // The userscript injects window.__paranoteRequest
  async function apiRequest(url, options = {}) {
    // If a userscript injected a request function, use it (bypasses CSP)
    if (window.__paranoteRequest) {
      return window.__paranoteRequest(url, options);
    }
    // Otherwise plain fetch
    const res = await fetch(url, options);
    return res.json();
  }
  
  async function apiPost(url, data) {
    const headers = { "Content-Type": "application/json" };
    if (typeof window !== "undefined" && window.PARANOTE_TOKEN) {
      headers["X-Paranote-Token"] = window.PARANOTE_TOKEN;
    }
    return apiRequest(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
  }
  
  async function apiGet(url) {
    return apiRequest(url, { method: "GET" });
  }
  
  async function apiDelete(url, data) {
    const headers = { "Content-Type": "application/json" };
    if (typeof window !== "undefined" && window.PARANOTE_TOKEN) {
      headers["X-Paranote-Token"] = window.PARANOTE_TOKEN;
    }
    return apiRequest(url, {
      method: "DELETE",
      headers,
      body: JSON.stringify(data),
    });
  }

  // Every user-facing string of the comment panel, in English
  const TEXT = {
    title: "Comments",
    placeholder: "Add a comment...",
    submit: "Post",
    submitting: "Posting...",
    submitFailed: "Failed to post comment",
    empty: "No comments yet",
    anonymous: "Anonymous",
    banned: "Banned",
    expand: "Show more",
    collapse: "Show less",
    reply: "Reply",
    replyPlaceholder: (name) => `Reply to ${name}...`,
    replySubmit: "Reply",
    replySubmitting: "Sending...",
    replyFailed: "Failed to send reply",
    cancel: "Cancel",
    deleteAuthor: "Delete (author)",
    deleteAdmin: "Delete (admin)",
    deleteConfirm: "Delete this comment?",
    deleteFailed: "Failed to delete comment",
    unbanTitle: "Unban user",
    banTitle: "Ban this user",
    unbanConfirm: (name) => `Unban user "${name}"?`,
    unbanSuccess: (name) => `Unbanned "${name}"`,
    unbanFailed: "Failed to unban user",
    banConfirm: (name) => `Ban user "${name}"?\nEnter a reason (optional):`,
    banReasonDefault: "Banned by admin",
    banSuccess: (name) => `User "${name}" has been banned`,
    banFailed: "Failed to ban user",
    alreadyLiked: "You have already liked this comment",
    commentCount: (n) => `${n} comment${n === 1 ? "" : "s"}`,
    showReplies: (n) => `Show ${n} repl${n === 1 ? "y" : "ies"} \u25BC`,
    hideReplies: "Hide replies \u25B2",
  };

  // Locale used for comment timestamps. Pinned to English so the panel never
  // falls back to the visitor's browser locale.
  const DATE_LOCALE = "en-US";

  function formatCommentTime(isoString) {
    if (!isoString) return "";
    return new Date(isoString).toLocaleString(DATE_LOCALE, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function init() {
      // Support multiple roots (e.g. several answers on one page)
      const roots = document.querySelectorAll("[data-na-root]");
      console.log("ParaNote: Checking roots...", roots.length);
      
      if (roots.length === 0) {
          console.log("ParaNote: Root not found, waiting for DOMContentLoaded...");
          if (document.readyState === "loading") {
              document.addEventListener("DOMContentLoaded", init);
          } else {
              console.warn("ParaNote: DOM loaded but root still missing");
          }
          return;
      }
      
      // Initialize each root
      roots.forEach((root, index) => initRoot(root, index));
  }
  
  function initRoot(root, rootIndex) {
      // Check if already initialized
      if (root.dataset.paranoteInitialized) {
          console.log(`ParaNote: Root ${rootIndex} already initialized`);
          return;
      }
      root.dataset.paranoteInitialized = "true";

      const workId = root.dataset.workId || "default-work";
      const chapterId = root.dataset.chapterId || root.dataset.ChapterId || "default-chapter";
      const paras = root.querySelectorAll("p");

      console.log(`ParaNote: Root ${rootIndex} - Found ${paras.length} paragraphs, chapterId: ${chapterId}`);

      if (!paras.length) {
          console.warn("ParaNote: No paragraphs found in root");
          return;
      }
      
      let currentParaIndex = null;

      // Detect mobile devices
      const isMobile = window.innerWidth <= 768 || "ontouchstart" in window;

      // Create the overlay (used on mobile)
      const overlay = document.createElement("div");
      overlay.className = "na-overlay";
      Object.assign(overlay.style, {
        position: "fixed",
        top: "0",
        left: "0",
        right: "0",
        bottom: "0",
        background: "rgba(0,0,0,0.5)",
        zIndex: 99998,
        display: "none",
      });
      overlay.onclick = function () {
        sidebar.container.style.display = "none";
        overlay.style.display = "none";
        if (isMobile) document.body.style.overflow = "";
        
        if (currentParaIndex !== null && paras[currentParaIndex]) {
            paras[currentParaIndex].style.textDecoration = "none";
            paras[currentParaIndex].style.background = "transparent";
            currentParaIndex = null;
            updateCommentCounts();
        }
      };
      document.body.appendChild(overlay);

      // Create the right-hand comment panel
      const sidebar = createSidebar();
      document.body.appendChild(sidebar.container);

      function createSidebar() {
        const container = document.createElement("div");
        container.className = "na-sidebar";
        
        // Hypothesis-style palette
        const styles = {
            bg: "#f7f7f7",
            cardBg: "#ffffff",
            text: "#333",
            meta: "#707070",
            border: "#dbdbdb",
            primary: "#bd1c2b", // Hypothesis red
            shadow: "0 4px 12px rgba(0,0,0,0.15)"
        };

        // Inject keyframe animations
        const styleTag = document.createElement('style');
        styleTag.textContent = `
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            @keyframes slideLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
        `;
        document.head.appendChild(styleTag);

        // Different styles for mobile and desktop
        if (isMobile) {
          Object.assign(container.style, {
            position: "fixed",
            bottom: "0",
            left: "0",
            right: "0",
            width: "100%",
            maxHeight: "85vh",
            background: styles.bg,
            borderTop: `1px solid ${styles.border}`,
            borderTopLeftRadius: "12px",
            borderTopRightRadius: "12px",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
            fontSize: "14px",
            display: "none",
            flexDirection: "column",
            zIndex: 99999,
            overflow: "hidden",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
          });
        } else {
          Object.assign(container.style, {
            position: "fixed",
            top: "0",
            right: "0",
            width: "380px", // a little wider
            height: "100vh", // full height
            background: styles.bg,
            borderLeft: `1px solid ${styles.border}`,
            boxShadow: "-2px 0 12px rgba(0,0,0,0.05)",
            fontSize: "14px",
            display: "none",
            flexDirection: "column",
            zIndex: 99999,
            overflow: "hidden",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            animation: "slideLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
          });
        }

        // Header bar
        const header = document.createElement("div");
        Object.assign(header.style, {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: `1px solid ${styles.border}`,
          background: styles.cardBg,
          color: styles.text,
          flexShrink: 0
        });
        
        const titleWrapper = document.createElement("div");
        titleWrapper.style.display = "flex";
        titleWrapper.style.alignItems = "center";
        titleWrapper.style.gap = "8px";
        
        const title = document.createElement("span");
        title.textContent = TEXT.title;
        title.style.fontWeight = "600";
        title.style.fontSize = "15px";
        
        // Comment count display
        const countSpan = document.createElement("span");
        countSpan.className = "na-comment-header-count";
        Object.assign(countSpan.style, {
            background: "#eee",
            color: "#666",
            padding: "2px 8px",
            borderRadius: "10px",
            fontSize: "12px",
            fontWeight: "500"
        });
        
        titleWrapper.append(title, countSpan);
        header.appendChild(titleWrapper);
        
        // Close button
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        Object.assign(closeBtn.style, {
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#999",
          padding: "4px",
          display: "flex",
          borderRadius: "4px",
          transition: "background 0.2s"
        });
        closeBtn.onmouseenter = () => closeBtn.style.background = "#f0f0f0";
        closeBtn.onmouseleave = () => closeBtn.style.background = "transparent";
        closeBtn.onclick = function () {
          container.style.display = "none";
          overlay.style.display = "none";
          if (isMobile) document.body.style.overflow = "";
          
          if (currentParaIndex !== null && paras[currentParaIndex]) {
              paras[currentParaIndex].style.textDecoration = "none";
              paras[currentParaIndex].style.background = "transparent";
              currentParaIndex = null;
              updateCommentCounts();
          }
        };
        header.appendChild(closeBtn);

        // List area
        const list = document.createElement("div");
        Object.assign(list.style, {
          padding: "16px",
          flex: "1",
          overflowY: "auto",
          background: "#f7f7f7", // grey background
          display: "flex",
          flexDirection: "column",
          gap: "12px" // card spacing
        });

        // Input area
        const inputArea = document.createElement("div");
        Object.assign(inputArea.style, {
          padding: "16px",
          borderTop: `1px solid ${styles.border}`,
          background: styles.cardBg,
          flexShrink: 0
        });

        const textarea = document.createElement("textarea");
        textarea.placeholder = TEXT.placeholder;
        Object.assign(textarea.style, {
          width: "100%",
          minHeight: "80px",
          boxSizing: "border-box",
          padding: "12px",
          border: `1px solid ${styles.border}`,
          borderRadius: "6px",
          fontSize: "14px",
          fontFamily: "inherit",
          resize: "vertical",
          outline: "none",
          transition: "border-color 0.2s, box-shadow 0.2s",
          marginBottom: "10px",
          userSelect: "text",
          WebkitUserSelect: "text"
        });
        textarea.onfocus = () => {
            textarea.style.borderColor = styles.primary;
            textarea.style.boxShadow = `0 0 0 2px rgba(189, 28, 43, 0.1)`;
        };
        textarea.onblur = () => {
            textarea.style.borderColor = styles.border;
            textarea.style.boxShadow = "none";
        };

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.justifyContent = "flex-end";

        const btn = document.createElement("button");
        btn.textContent = TEXT.submit;
        Object.assign(btn.style, {
          padding: "8px 20px",
          border: "none",
          background: styles.primary,
          color: "#fff",
          cursor: "pointer",
          borderRadius: "20px", // rounded button
          fontSize: "14px",
          fontWeight: "600",
          transition: "opacity 0.2s",
          boxShadow: "0 2px 4px rgba(189, 28, 43, 0.3)"
        });
        btn.onmouseenter = () => btn.style.opacity = "0.9";
        btn.onmouseleave = () => btn.style.opacity = "1";

        btn.onclick = async function () {
          const content = textarea.value.trim();
          if (!content || currentParaIndex == null) return;
          
          // Grab the context fingerprint of the current paragraph (first 32 characters)
          const pText = paras[currentParaIndex] ? getParaText(paras[currentParaIndex]) : "";
          const contextText = pText.slice(0, 32);

          try {
            btn.textContent = TEXT.submitting;
            btn.disabled = true;

            await apiPost(apiBase + "/api/v1/comments", {
              siteId,
              workId,
              chapterId,
              paraIndex: currentParaIndex,
              content,
              contextText,
            });
            textarea.value = "";
            await loadAllComments();
            updateCommentCounts();
            await loadComments(currentParaIndex, list, sidebar.headerCount);
          } catch (e) {
            console.error("post comment failed", e);
            alert(TEXT.submitFailed);
          } finally {
            btn.textContent = TEXT.submit;
            btn.disabled = false;
          }
        };
        
        btnRow.appendChild(btn);
        inputArea.append(textarea, btnRow);
        
        container.append(header, list, inputArea);
        return { container, list, headerCount: countSpan };
      }

      // Helper to get pure text content excluding the badge
      function getParaText(p) {
          if (!p) return "";
          // Clone to not modify DOM
          const clone = p.cloneNode(true);
          const badge = clone.querySelector(".na-comment-count");
          if (badge) badge.remove();
          return clone.textContent.trim();
      }

      // Cache the comment data for every paragraph
      let allCommentsData = null;

      // Fuzzy re-anchoring: remount comments onto the correct paragraph
      function reanchorComments(serverData) {
          const correctedData = {};
          const allComments = [];
          
          // 1. Flatten every comment
          Object.values(serverData).forEach(list => allComments.push(...list));
          
          // 2. Reassign
          allComments.forEach(c => {
              let targetIndex = c.paraIndex;
              
              // Check whether re-anchoring is needed.
              // If a context fingerprint exists and the text at the current location
              // does not match, search the whole document.
              if (c.contextText) {
                  const currentText = getParaText(paras[targetIndex]);
                  
                  // If the paragraph is missing, or the beginning does not match, the paragraph moved
                  if (!currentText.startsWith(c.contextText)) {
                      // Simple whole-document search (fuzzy search).
                      // Optimisation would search nearby first, then the whole document;
                      // simplified here to a direct whole-document search.
                      let bestMatchIndex = -1;
                      
                      for (let i = 0; i < paras.length; i++) {
                          const pText = getParaText(paras[i]);
                          if (pText.startsWith(c.contextText)) {
                              bestMatchIndex = i;
                              break; // found it
                          }
                      }
                      
                      if (bestMatchIndex !== -1) {
                          targetIndex = bestMatchIndex;
                          // console.log(`Re-anchored comment ${c.id} from ${c.paraIndex} to ${targetIndex}`);
                      } else {
                          // If no matching paragraph is found the comment becomes an "orphan".
                          // It is kept in place rather than dropped, so the thread stays readable.
                      }
                  }
              }
              
              const key = String(targetIndex);
              if (!correctedData[key]) correctedData[key] = [];
              correctedData[key].push(c);
          });
          
          return correctedData;
      }

      async function loadAllComments() {
        try {
          const url =
            apiBase +
            "/api/v1/comments?siteId=" +
            encodeURIComponent(siteId) +
            "&workId=" +
            encodeURIComponent(workId) +
            "&chapterId=" +
            encodeURIComponent(chapterId);
          const data = await apiGet(url);
          
          // Apply the fuzzy re-anchoring corrections
          allCommentsData = reanchorComments(data.commentsByPara || {});
          return allCommentsData;
        } catch (e) {
          console.error("load comments failed", e);
          return {};
        }
      }

      // Minimal JWT decoder
      function parseJwt(token) {
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          return JSON.parse(jsonPayload);
        } catch (e) {
          return null;
        }
      }

      async function loadComments(paraIndex, listEl, headerCountEl) {
        const arr = (allCommentsData || {})[String(paraIndex)] || [];

        listEl.innerHTML = "";
        
        // Check the current user's permissions
        let isAdmin = false;
        let isAuthor = false;
        let token = null;
        let editToken = null;
        let currentUserId = null;
        
        if (typeof window !== "undefined" && window.PARANOTE_TOKEN) {
          token = window.PARANOTE_TOKEN;
          const payload = parseJwt(token);
          if (payload) {
            currentUserId = payload.sub || payload.userId;
            if (payload.role === 'admin' || payload.isAdmin === true) {
              isAdmin = true;
            }
          }
        }
        
        // Check whether the visitor is the note author
        // (TAPNOTE_EDIT_TOKEN, PARANOTE_EDIT_TOKEN or data-edit-token)
        if (typeof window !== "undefined") {
          editToken = window.TAPNOTE_EDIT_TOKEN || window.PARANOTE_EDIT_TOKEN || script.dataset.editToken;
          if (editToken) {
            isAuthor = true;
          }
        }
        
        // Fetch the ban list (visible to admins and authors)
        let bannedUserIds = new Set();
        if (isAdmin || isAuthor) {
          try {
            const headers = {};
            if (token) headers["X-Paranote-Token"] = token;
            const banRes = await apiRequest(apiBase + `/api/v1/ban?siteId=${encodeURIComponent(siteId)}`, { headers });
            if (banRes.bannedUsers) {
              bannedUserIds = new Set(banRes.bannedUsers.map(b => b.userId));
            }
          } catch (e) {
            console.warn("ParaNote: Failed to load banlist", e);
          }
        }
        
        // Update the header comment count
        if (headerCountEl) {
          headerCountEl.textContent = arr.length > 0 ? String(arr.length) : "";
        }
        
        if (!arr.length) {
          const empty = document.createElement("div");
          empty.style.cssText = "padding: 60px 20px; text-align: center; color: #999; font-size: 13px; background: #fff;";
          empty.innerHTML = `<div style="margin-bottom: 8px; font-size: 32px; opacity: 0.5;">💬</div><div>${TEXT.empty}</div>`;
          listEl.appendChild(empty);
          return;
        }
        
        arr.forEach(function (c, idx) {
          const item = document.createElement("div");
          item.className = "na-comment-card";
          Object.assign(item.style, {
            padding: "12px",
            marginBottom: "0", // gap is controlled by the parent container
            background: "#fff",
            borderRadius: "8px",
            border: "1px solid #eee",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            transition: "transform 0.2s, box-shadow 0.2s",
            position: "relative"
          });
          
          if (!isMobile) {
              item.addEventListener("mouseenter", () => {
                  item.style.transform = "translateY(-1px)";
                  item.style.boxShadow = "0 4px 8px rgba(0,0,0,0.08)";
              });
              item.addEventListener("mouseleave", () => {
                  item.style.transform = "none";
                  item.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
              });
          }
          
          // User info row
          const userRow = document.createElement("div");
          userRow.style.cssText = "display: flex; align-items: center; margin-bottom: 8px;";
          
          // User avatar (colourful)
          const avatar = document.createElement("div");
          const name = c.userName || c.userId || TEXT.anonymous;
          const firstChar = name.length > 0 ? name.charAt(0).toUpperCase() : "?";
          
          // Derive a stable colour from the name
          let hash = 0;
          for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
          const hue = Math.abs(hash) % 360;
          
          avatar.style.cssText = `
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: hsl(${hue}, 60%, 85%);
            color: hsl(${hue}, 60%, 30%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 14px;
            margin-right: 10px;
            flex-shrink: 0;
            border: 1px solid rgba(0,0,0,0.05);
          `;
          avatar.textContent = firstChar;
          
          const userInfo = document.createElement("div");
          userInfo.style.cssText = "flex: 1; min-width: 0; display: flex; flex-direction: column;";
          
          const userName = document.createElement("span");
          userName.style.cssText = "font-weight: 600; color: #333; font-size: 13px; display: flex; align-items: center; gap: 6px;";
          
          // Username text
          const nameText = document.createElement("span");
          nameText.textContent = name;
          userName.appendChild(nameText);
          
          // Banned badge (visible to admins and authors)
          const isUserBanned = c.userId && bannedUserIds.has(c.userId);
          if ((isAdmin || isAuthor) && isUserBanned) {
            const bannedBadge = document.createElement("span");
            bannedBadge.textContent = TEXT.banned;
            bannedBadge.style.cssText = "font-size: 10px; color: #fff; background: #bd1c2b; padding: 1px 6px; border-radius: 10px; font-weight: 500;";
            userName.appendChild(bannedBadge);
          }
          
          const meta = document.createElement("span");
          meta.style.cssText = "font-size: 11px; color: #999; margin-top: 2px;";
          meta.textContent = formatCommentTime(c.createdAt);
          
          userInfo.appendChild(userName);
          userInfo.appendChild(meta);
          userRow.appendChild(avatar);
          userRow.appendChild(userInfo);
          
          // Comment body
          const content = document.createElement("div");
          content.style.cssText = "color: #444; font-size: 14px; line-height: 1.6; word-break: break-word; padding-left: 42px;";
          
          // Handle quoted content (simple markdown blockquote)
          let contentText = c.content || '';
          const MAX_LENGTH = 150; // collapse beyond 150 characters
          
          // Build the collapsible content display
          function createCollapsibleContent(text, container) {
              if (text.length > MAX_LENGTH) {
                  const shortText = text.slice(0, MAX_LENGTH) + '...';
                  const textNode = document.createElement('span');
                  textNode.textContent = shortText;
                  
                  const expandBtn = document.createElement('span');
                  expandBtn.textContent = ' ' + TEXT.expand;
                  expandBtn.style.cssText = 'color:#bd1c2b;cursor:pointer;font-size:12px;margin-left:4px;';
                  
                  let expanded = false;
                  expandBtn.onclick = (e) => {
                      e.stopPropagation();
                      expanded = !expanded;
                      textNode.textContent = expanded ? text : shortText;
                      expandBtn.textContent = ' ' + (expanded ? TEXT.collapse : TEXT.expand);
                  };
                  
                  container.appendChild(textNode);
                  container.appendChild(expandBtn);
              } else {
                  container.textContent = text;
              }
          }
          
          if (contentText.startsWith("> ")) {
              const parts = contentText.split("\n");
              const quoteText = parts[0].substring(2);
              const mainText = parts.slice(1).join("\n").trim();
              
              const blockquote = document.createElement("div");
              blockquote.style.cssText = "border-left: 3px solid #bd1c2b; padding-left: 8px; color: #777; margin-bottom: 6px; font-size: 13px; background: #f9f9f9; padding: 4px 8px; border-radius: 0 4px 4px 0;";
              blockquote.textContent = quoteText;
              content.appendChild(blockquote);
              
              const p = document.createElement("div");
              createCollapsibleContent(mainText, p);
              content.appendChild(p);
          } else {
              createCollapsibleContent(contentText, content);
          }
          
          // Action bar (reply, like, delete)
          const actionContainer = document.createElement("div");
          actionContainer.style.cssText = "display: flex; justify-content: flex-end; align-items: center; margin-top: 8px; padding-left: 42px; gap: 8px;";
          
          // Reply button
          const replyBtn = document.createElement("button");
          replyBtn.textContent = "💬 " + TEXT.reply;
          replyBtn.style.cssText = "border:none; background:transparent; cursor:pointer; color:#666; font-size:12px; transition:color 0.2s;";
          replyBtn.onmouseenter = () => replyBtn.style.color = "#bd1c2b";
          replyBtn.onmouseleave = () => replyBtn.style.color = "#666";
          replyBtn.onclick = function(e) {
            e.stopPropagation();
            showReplyInput(item, c, paraIndex, listEl, headerCountEl);
          };
          actionContainer.appendChild(replyBtn);
          
          // Delete button (admins and the note author may delete)
          if (isAdmin || isAuthor) {
            const delBtn = document.createElement("button");
            delBtn.textContent = "🗑️";
            delBtn.title = isAuthor ? TEXT.deleteAuthor : TEXT.deleteAdmin;
            delBtn.style.cssText = "border:none; background:transparent; cursor:pointer; color:#aaa; font-size:14px; transition:color 0.2s;";
            delBtn.onmouseenter = () => delBtn.style.color = "#bd1c2b";
            delBtn.onmouseleave = () => delBtn.style.color = "#aaa";
            delBtn.onclick = async function(e) {
              e.stopPropagation();
              if(!confirm(TEXT.deleteConfirm)) return;
              try {
                 const deleteData = { siteId, workId, chapterId, commentId: c.id };
                 if (editToken) {
                   deleteData.editToken = editToken;
                 }
                 
                 const result = await apiDelete(apiBase + "/api/v1/comments", deleteData);
                 if (!result.error) {
                     await loadAllComments();
                     updateCommentCounts();
                     await loadComments(paraIndex, listEl, headerCountEl);
                 } else {
                     alert(result.error || TEXT.deleteFailed);
                 }
              } catch(e) { 
                 console.error(e);
                 alert(TEXT.deleteFailed);
              }
            };
            actionContainer.appendChild(delBtn);
            
            // Ban / unban button (visible to admins and authors; you cannot ban yourself)
            if ((isAdmin || isAuthor) && c.userId && c.userId !== currentUserId) {
              const banBtn = document.createElement("button");
              let isBanned = isUserBanned;
              
              // Refresh the button state
              function updateBanBtnState() {
                if (isBanned) {
                  banBtn.textContent = "✅";
                  banBtn.title = TEXT.unbanTitle;
                  banBtn.style.color = "#52c41a";
                } else {
                  banBtn.textContent = "🚫";
                  banBtn.title = TEXT.banTitle;
                  banBtn.style.color = "#aaa";
                }
              }
              
              banBtn.style.cssText = "border:none; background:transparent; cursor:pointer; font-size:14px; transition:color 0.2s;";
              updateBanBtnState();
              
              banBtn.onmouseenter = () => banBtn.style.opacity = "0.7";
              banBtn.onmouseleave = () => banBtn.style.opacity = "1";
              
              banBtn.onclick = async function(e) {
                e.stopPropagation();
                const headers = { "Content-Type": "application/json" };
                if (window.PARANOTE_TOKEN) {
                  headers["X-Paranote-Token"] = window.PARANOTE_TOKEN;
                }
                
                try {
                  if (isBanned) {
                    // Unban
                    if (!confirm(TEXT.unbanConfirm(c.userName || c.userId))) return;
                    const result = await apiRequest(apiBase + "/api/v1/ban", {
                      method: "DELETE",
                      headers,
                      body: JSON.stringify({ siteId, targetUserId: c.userId })
                    });
                    if (result.success) {
                      isBanned = false;
                      bannedUserIds.delete(c.userId);
                      updateBanBtnState();
                      // Remove the banned badge
                      const badge = userName.querySelector('span:last-child');
                      if (badge && badge.textContent === TEXT.banned) badge.remove();
                      alert(TEXT.unbanSuccess(c.userName || c.userId));
                    } else {
                      alert(result.error || TEXT.unbanFailed);
                    }
                  } else {
                    // Ban
                    const reason = prompt(TEXT.banConfirm(c.userName || c.userId));
                    if (reason === null) return;
                    const result = await apiRequest(apiBase + "/api/v1/ban", {
                      method: "POST",
                      headers,
                      body: JSON.stringify({ siteId, targetUserId: c.userId, reason: reason || TEXT.banReasonDefault })
                    });
                    if (result.success) {
                      isBanned = true;
                      bannedUserIds.add(c.userId);
                      updateBanBtnState();
                      // Add the banned badge
                      const bannedBadge = document.createElement("span");
                      bannedBadge.textContent = TEXT.banned;
                      bannedBadge.style.cssText = "font-size: 10px; color: #fff; background: #bd1c2b; padding: 1px 6px; border-radius: 10px; font-weight: 500;";
                      userName.appendChild(bannedBadge);
                      alert(TEXT.banSuccess(c.userName || c.userId));
                    } else {
                      alert(result.error || TEXT.banFailed);
                    }
                  }
                } catch(e) { 
                  console.error(e);
                  alert(isBanned ? TEXT.unbanFailed : TEXT.banFailed);
                }
              };
              actionContainer.appendChild(banBtn);
            }
          }
          
          // Like button
          const likeBtn = document.createElement("button");
          const likes = c.likes || 0;
          likeBtn.innerHTML = `<span style="font-size:14px">❤️</span> <span style="margin-left:4px; font-size:12px;">${likes || ''}</span>`;
          likeBtn.style.cssText = "border:none; background:transparent; cursor:pointer; color:#aaa; display:flex; align-items:center; padding: 2px 6px; transition:color 0.2s; border-radius:4px;";
          
          likeBtn.onmouseenter = () => { likeBtn.style.color = "#bd1c2b"; likeBtn.style.background = "#fff0f0"; };
          likeBtn.onmouseleave = () => { likeBtn.style.color = "#aaa"; likeBtn.style.background = "transparent"; };

          likeBtn.onclick = async function(e) {
              e.stopPropagation();
              try {
                 const data = await apiPost(apiBase + "/api/v1/comments/like", { siteId, workId, chapterId, commentId: c.id });
                 
                 if (data.error === 'already_liked') return alert(TEXT.alreadyLiked);
                 if (data.error) return alert(data.error);

                 if (data.likes !== undefined) {
                     likeBtn.innerHTML = `<span style="font-size:14px">❤️</span> <span style="margin-left:4px; font-weight:bold; color:#bd1c2b">${data.likes}</span>`;
                     likeBtn.style.color = "#bd1c2b";
                 }
              } catch(e) { console.error(e); }
          };

          actionContainer.appendChild(likeBtn);
          
          item.appendChild(userRow);
          item.appendChild(content);
          item.appendChild(actionContainer);
          
          // Show replies (collapsed when there are more than two)
          if (c.replies && c.replies.length > 0) {
            const repliesContainer = document.createElement("div");
            repliesContainer.style.cssText = "margin-top: 12px; padding-left: 42px; border-left: 2px solid #eee;";
            
            const MAX_VISIBLE_REPLIES = 2;
            const replies = c.replies;
            
            if (replies.length > MAX_VISIBLE_REPLIES) {
              // Show the first two replies
              replies.slice(0, MAX_VISIBLE_REPLIES).forEach(reply => {
                const replyItem = createReplyItem(reply, paraIndex, listEl, headerCountEl, isAdmin, isAuthor, token, editToken);
                repliesContainer.appendChild(replyItem);
              });
              
              // Container for the hidden replies
              const hiddenReplies = document.createElement("div");
              hiddenReplies.style.display = "none";
              replies.slice(MAX_VISIBLE_REPLIES).forEach(reply => {
                const replyItem = createReplyItem(reply, paraIndex, listEl, headerCountEl, isAdmin, isAuthor, token, editToken);
                hiddenReplies.appendChild(replyItem);
              });
              repliesContainer.appendChild(hiddenReplies);
              
              // Expand / collapse toggle
              const toggleBtn = document.createElement("div");
              toggleBtn.style.cssText = "color:#bd1c2b;font-size:12px;cursor:pointer;padding:8px 0;";
              toggleBtn.textContent = TEXT.showReplies(replies.length - MAX_VISIBLE_REPLIES);
              toggleBtn.onclick = (e) => {
                e.stopPropagation();
                if (hiddenReplies.style.display === "none") {
                  hiddenReplies.style.display = "block";
                  toggleBtn.textContent = TEXT.hideReplies;
                } else {
                  hiddenReplies.style.display = "none";
                  toggleBtn.textContent = TEXT.showReplies(replies.length - MAX_VISIBLE_REPLIES);
                }
              };
              repliesContainer.appendChild(toggleBtn);
            } else {
              replies.forEach(reply => {
                const replyItem = createReplyItem(reply, paraIndex, listEl, headerCountEl, isAdmin, isAuthor, token, editToken);
                repliesContainer.appendChild(replyItem);
              });
            }
            
            item.appendChild(repliesContainer);
          }
          
          listEl.appendChild(item);
        });
      }
      
      // Build a reply item
      function createReplyItem(reply, paraIndex, listEl, headerCountEl, isAdmin, isAuthor, token, editToken) {
        const item = document.createElement("div");
        item.style.cssText = "padding: 8px 0; border-bottom: 1px solid #f5f5f5;";
        
        const name = reply.userName || reply.userId || TEXT.anonymous;
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash) % 360;
        
        const header = document.createElement("div");
        header.style.cssText = "display: flex; align-items: center; margin-bottom: 4px;";
        
        const avatar = document.createElement("span");
        avatar.style.cssText = `width: 20px; height: 20px; border-radius: 50%; background: hsl(${hue}, 60%, 85%); color: hsl(${hue}, 60%, 30%); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; margin-right: 6px;`;
        avatar.textContent = name.charAt(0).toUpperCase();
        
        const userName = document.createElement("span");
        userName.style.cssText = "font-size: 12px; font-weight: 600; color: #555;";
        userName.textContent = name;
        
        const time = document.createElement("span");
        time.style.cssText = "font-size: 10px; color: #999; margin-left: 8px;";
        time.textContent = formatCommentTime(reply.createdAt);
        
        header.append(avatar, userName, time);
        
        const content = document.createElement("div");
        content.style.cssText = "font-size: 13px; color: #555; line-height: 1.5; padding-left: 26px;";
        content.textContent = reply.content;
        
        item.append(header, content);
        
        // Recursively render nested replies
        if (reply.replies && reply.replies.length > 0) {
          const nested = document.createElement("div");
          nested.style.cssText = "margin-left: 26px; margin-top: 8px;";
          reply.replies.forEach(r => {
            nested.appendChild(createReplyItem(r, paraIndex, listEl, headerCountEl, isAdmin, isAuthor, token, editToken));
          });
          item.appendChild(nested);
        }
        
        return item;
      }
      
      // Show the reply input box
      function showReplyInput(parentItem, parentComment, paraIndex, listEl, headerCountEl) {
        // Remove any existing reply box
        const existing = parentItem.querySelector(".reply-input-box");
        if (existing) {
          existing.remove();
          return;
        }
        
        const box = document.createElement("div");
        box.className = "reply-input-box";
        box.style.cssText = "margin-top: 10px; padding: 10px; background: #f9f9f9; border-radius: 6px; margin-left: 42px;";
        
        const textarea = document.createElement("textarea");
        textarea.placeholder = TEXT.replyPlaceholder(parentComment.userName || TEXT.anonymous);
        textarea.style.cssText = "width: 100%; height: 60px; border: 1px solid #ddd; border-radius: 4px; padding: 8px; font-size: 13px; resize: none; box-sizing: border-box; user-select: text; -webkit-user-select: text;";
        
        const btnRow = document.createElement("div");
        btnRow.style.cssText = "display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;";
        
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = TEXT.cancel;
        cancelBtn.style.cssText = "padding: 6px 12px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px;";
        cancelBtn.onclick = () => box.remove();
        
        const submitBtn = document.createElement("button");
        submitBtn.textContent = TEXT.replySubmit;
        submitBtn.style.cssText = "padding: 6px 12px; border: none; background: #bd1c2b; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px;";
        submitBtn.onclick = async () => {
          const content = textarea.value.trim();
          if (!content) return;
          
          try {
            submitBtn.textContent = TEXT.replySubmitting;
            submitBtn.disabled = true;
            
            await apiPost(apiBase + "/api/v1/comments", {
              siteId,
              workId,
              chapterId,
              paraIndex,
              content,
              parentId: parentComment.id,
            });
            
            box.remove();
            await loadAllComments();
            updateCommentCounts();
            await loadComments(paraIndex, listEl, headerCountEl);
          } catch (e) {
            console.error("reply failed", e);
            alert(TEXT.replyFailed);
            submitBtn.textContent = TEXT.replySubmit;
            submitBtn.disabled = false;
          }
        };
        
        btnRow.append(cancelBtn, submitBtn);
        box.append(textarea, btnRow);
        parentItem.appendChild(box);
        textarea.focus();
      }

      // Refresh the per-paragraph comment counts
      function updateCommentCounts() {
        paras.forEach(function (p, idx) {
          const count = (allCommentsData || {})[String(idx)]?.length || 0;
          let badge = p.querySelector(".na-comment-count");
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "na-comment-count";
            p.appendChild(badge);
          }

          // Styling rule: grey by default, red only for the currently selected paragraph
          const isActive = (currentParaIndex === idx);
          
          // Consistent style: always show the number, no emoji
          // Inactive: grey (#999), active: red (#f56c6c)
          const color = isActive ? "#f56c6c" : "#999";
          const borderColor = isActive ? "#f56c6c" : "#e0e0e0"; // lighter border while idle
          
          Object.assign(badge.style, {
            display: "inline-block",
            marginLeft: isMobile ? "8px" : "6px",
            padding: "0 4px",
            fontSize: isMobile ? "11px" : "10px",
            color: color,
            background: "#fff",
            border: `1px solid ${borderColor}`,
            borderRadius: "2px",
            cursor: "pointer",
            fontWeight: "500",
            minWidth: "18px",
            height: "18px",
            lineHeight: "16px", // adjust for border
            textAlign: "center",
            verticalAlign: "middle",
            touchAction: "manipulation",
            transition: "all 0.15s ease",
            boxSizing: "border-box",
          });
          
          badge.textContent = count;
          badge.title = TEXT.commentCount(count);
          
          // Remove earlier special-case styling overrides
          badge.style.fontSize = isMobile ? "11px" : "10px";
          
          if (!isMobile) {
            badge.onmouseenter = function () {
              badge.style.borderColor = "#f56c6c";
              badge.style.color = "#f56c6c";
            };
            badge.onmouseleave = function () {
              badge.style.borderColor = borderColor;
              badge.style.color = color;
            };
          }
        });
      }

      // Attach click handlers and comment counters to every paragraph
      paras.forEach(function (p, idx) {
        p.dataset.naIndex = String(idx);
        Object.assign(p.style, {
          cursor: "pointer",
          position: "relative",
          padding: isMobile ? "8px 0" : "4px 0", // larger tap target on mobile
          borderRadius: "4px",
          transition: "all 0.2s",
          WebkitTapHighlightColor: "transparent", // remove the mobile tap highlight
          touchAction: "manipulation", // smoother touch handling on mobile
        });

        // Subtle hover state on desktop
        if (!isMobile) {
          p.addEventListener("mouseenter", function () {
            if (currentParaIndex !== idx) {
              p.style.background = "rgba(0, 0, 0, 0.02)";
            }
          });
          p.addEventListener("mouseleave", function () {
            if (currentParaIndex !== idx) {
              p.style.background = "transparent";
              p.style.textDecoration = "none";
            }
          });
        }

        // Shared click / touch handler
        const handleClick = async function (e) {
          // Links and interactive elements keep their own behaviour and do not trigger comments
          if (e.target.closest("a, button, input, textarea, select, [role='button']")) return;

          // Clear the underline on the previously selected paragraph
          if (currentParaIndex !== null && paras[currentParaIndex]) {
            paras[currentParaIndex].style.textDecoration = "none";
            paras[currentParaIndex].style.background = "transparent";
          }

          // Clicking the paragraph that is already open closes the panel
          if (currentParaIndex === idx && sidebar.container.style.display !== "none") {
              currentParaIndex = null;
              updateCommentCounts();
              sidebar.container.style.display = "none";
              if (isMobile) {
                  overlay.style.display = "none";
                  document.body.style.overflow = "";
              }
              return;
          }
          
          // Underline the selected paragraph (red underline)
          currentParaIndex = idx;
          p.style.textDecoration = "underline";
          p.style.textDecorationColor = "#f56c6c";
          p.style.textDecorationThickness = isMobile ? "2px" : "1.5px";
          p.style.textUnderlineOffset = "2px";
          p.style.background = "transparent";
          
          // Refresh every badge (the selected one turns red)
          updateCommentCounts();

          // Show the sidebar and the overlay
          sidebar.container.style.display = "flex";
          if (isMobile) {
            overlay.style.display = "block";
            document.body.style.overflow = "hidden";
            // Scroll the mobile panel back to the top
            sidebar.container.scrollTop = 0;
          }
          await loadComments(idx, sidebar.list, sidebar.headerCount);
        };

        p.onclick = handleClick;
        // Mobile also listens for touchstart (prevents double-tap zoom)
        if (isMobile) {
          p.addEventListener("touchend", function (e) {
            // e.preventDefault(); // keep the default so text selection still works
            // handleClick(e);
          }, { passive: false });
        }
      });

      // Bootstrap: load every comment and refresh the counters
      loadAllComments().then(function () {
        updateCommentCounts();
      });
  } // End of init

  init();

})();
