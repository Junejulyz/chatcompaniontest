import { getContext } from "../../../extensions.js";
import { getPastCharacterChats } from '../../../../script.js';

const extensionName = "chatcompaniontest";
// Use an absolute path for web requests (relative to the domain root)
const extensionWebPath = `/scripts/extensions/third-party/${extensionName}`; 

jQuery(async () => {
  // 加载CSS文件 using absolute path
  $('head').append(`<link rel="stylesheet" type="text/css" href="${extensionWebPath}/styles.css">`);
  
  // 加载HTML using absolute path
  const settingsHtml = await $.get(`${extensionWebPath}/settings.html`);
  $("#extensions_settings2").append($(settingsHtml).not("#ccs-modal-overlay")); // Append everything except the modal overlay
  $("body").append($("#ccs-modal-overlay")); // Append the modal overlay directly to the body

  // 确保模态框初始状态是隐藏的
  $("#ccs-modal-overlay").hide();

  function getCurrentCharacterName() {
    // 从聊天消息中获取非用户消息的 ch_name
    const messages = document.querySelectorAll('#chat .mes');
    for (const msg of messages) {
      const isUser = msg.getAttribute('is_user') === 'true';
      if (!isUser) {
        const chName = msg.getAttribute('ch_name');
        if (chName) return chName;
      }
    }

    // 备用方法：从选中的角色按钮获取
    const selectedChar = document.querySelector('#rm_button_selected_ch h2');
    if (selectedChar?.textContent) {
      return selectedChar.textContent.trim();
    }

    return "未知角色";
  }

  // Helper function to parse SillyTavern's date format more reliably
  // Use both full month names and 3-letter abbreviations
  const monthMap = {
    Jan: '01', January: '01',
    Feb: '02', February: '02',
    Mar: '03', March: '03',
    Apr: '04', April: '04',
    May: '05', May: '05',
    Jun: '06', June: '06',
    Jul: '07', July: '07',
    Aug: '08', August: '08',
    Sep: '09', September: '09',
    Oct: '10', October: '10',
    Nov: '11', November: '11',
    Dec: '12', December: '12'
  };

  function parseSillyTavernDate(dateString) {
    console.log(`Attempting to parse date: "${dateString}"`);
    if (!dateString) {
        console.log("Date string is empty, returning null.");
        return null;
    }

    // Try parsing the specific format "Month Day, Year HH:MMam/pm"
    const parts = dateString.match(/(\w+)\s+(\d+),\s+(\d+)\s+(\d+):(\d+)(am|pm)/i);
    console.log("Regex match result (parts):", parts);
    if (parts) {
      console.log("Regex matched specific format.");
      const monthName = parts[1];
      const day = parts[2];
      const year = parts[3];
      let hour = parseInt(parts[4], 10);
      const minute = parts[5];
      const ampm = parts[6].toLowerCase();
      console.log(`Parsed parts: Month=${monthName}, Day=${day}, Year=${year}, Hour=${hour}, Minute=${minute}, AMPM=${ampm}`);

      const monthNumber = monthMap[monthName];
      if (!monthNumber) {
         console.warn(`Unknown month name "${monthName}" in date string: ${dateString}`);
         return null;
      }
      console.log(`Month number: ${monthNumber}`);

      if (ampm === 'pm' && hour !== 12) {
        hour += 12;
        console.log(`Adjusted hour for PM: ${hour}`);
      } else if (ampm === 'am' && hour === 12) {
        hour = 0;
        console.log(`Adjusted hour for 12 AM: ${hour}`);
      }

      // Construct an ISO-like string that new Date() handles reliably
      const isoLikeString = `${year}-${monthNumber}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}:00`;
      console.log(`Constructed ISO-like string: ${isoLikeString}`);
      const date = new Date(isoLikeString);
      console.log(`Result of new Date(isoLikeString): ${date}`);
      const isValid = date && !isNaN(date.getTime());
      console.log(`Is parsed date valid? ${isValid}`);
      return isValid ? date : null;
    }

    console.log("Regex did not match specific format, trying fallback.");
    // Fallback: Try direct parsing for other potential formats
    const fallbackDate = new Date(dateString);
    console.log(`Result of fallback new Date(dateString): ${fallbackDate}`);
    const isFallbackValid = fallbackDate && !isNaN(fallbackDate.getTime());
    console.log(`Is fallback date valid? ${isFallbackValid}`);
    return isFallbackValid ? fallbackDate : null;
  }

  // 从文件名解析时间
  function parseTimeFromFilename(filename) {
    // 从文件名中提取日期和时间
    const match = filename.match(/(\d{4}-\d{2}-\d{2})@(\d{2})h(\d{2})m(\d{2})s/);
    if (match) {
      const [_, date, hours, minutes, seconds] = match;
      return {
        date,
        time: `${hours}:${minutes}:${seconds}`,
        fullDateTime: `${date} ${hours}:${minutes}:${seconds}`
      };
    }
    return null;
  }

  // 格式化日期时间
  function formatDateTime(dateTimeString) {
    if (!dateTimeString) return "未知时间";
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) return "未知时间";
    
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    return `${year}年${month}月${day}日 ${hours}点${minutes}分`;
  }

  // 格式化时长
  function formatDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds}秒`;
    } else {
      return `${seconds}秒`;
    }
  }

  // 计算消息的字数
  function countWordsInMessage(message) {
    const text = message.replace(/<[^>]*>/g, '');
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
    const englishWords = text.match(/[a-zA-Z0-9]+/g) || [];
    const chineseCount = chineseChars.length;
    const englishCount = englishWords.length;
    const totalCount = chineseCount + englishCount;
    
    if (totalCount === 0) return 0;

    const chineseRatio = chineseCount / totalCount;
    const englishRatio = englishWords.length / totalCount;

    // 优化：中文按1字，英文按0.6字处理
    const optimizedWordCount = chineseCount * 1 + englishCount * 0.6;

    return optimizedWordCount;
  }

  // 获取当前聊天的字数统计和大小
  function getCurrentChatStats() {
    const messages = document.querySelectorAll('#chat .mes');
    let userWords = 0, userSize = 0, userCount = 0;
    let charWords = 0, charSize = 0, charCount = 0;
    let userChineseRatio = 0, userEnglishRatio = 0;
    let charChineseRatio = 0, charEnglishRatio = 0;

    messages.forEach(message => {
      const content = message.querySelector('.mes_text')?.textContent || '';
      const isUser = message.getAttribute('is_user') === 'true';
      const words = countWordsInMessage(content);
      
      // 计算中英文比例
      const chineseChars = content.match(/[\u4e00-\u9fff]/g) || [];
      const englishWords = content.match(/[a-zA-Z0-9]+/g) || [];
      const totalChars = chineseChars.length + englishWords.length;
      
      if (totalChars > 0) {
        const chineseRatio = chineseChars.length / totalChars;
        const englishRatio = englishWords.length / totalChars;
        
        if (isUser) {
          userChineseRatio += chineseRatio;
          userEnglishRatio += englishRatio;
        } else {
          charChineseRatio += chineseRatio;
          charEnglishRatio += englishRatio;
        }
      }

      const messageData = {
        content,
        is_user: isUser,
        ch_name: message.getAttribute('ch_name') || '',
        send_date: message.getAttribute('send_date') || ''
      };
      const messageSize = JSON.stringify(messageData).length + 2;

      if (isUser) {
        userWords += words;
        userSize += messageSize;
        userCount++;
      } else {
        charWords += words;
        charSize += messageSize;
        charCount++;
      }
    });

    // 计算平均中英文比例
    if (userCount > 0) {
      userChineseRatio /= userCount;
      userEnglishRatio /= userCount;
    }
    if (charCount > 0) {
      charChineseRatio /= charCount;
      charEnglishRatio /= charCount;
    }

    return {
      user: { 
        words: userWords, 
        size: userSize, 
        count: userCount,
        chineseRatio: userChineseRatio,
        englishRatio: userEnglishRatio
      },
      char: { 
        words: charWords, 
        size: charSize, 
        count: charCount,
        chineseRatio: charChineseRatio,
        englishRatio: charEnglishRatio
      }
    };
  }

  // 获取最大的聊天文件内容
  async function fetchLargestChatFile(characterId) {
    const chats = await getPastCharacterChats(characterId);
    
    if (!chats || chats.length === 0) return null;
    
    // 找最大文件
    const largestChat = chats.reduce((prev, current) => {
      const prevSize = parseFloat(prev.file_size) || 0;
      const currentSize = parseFloat(current.file_size) || 0;
      return (currentSize > prevSize) ? current : prev;
    });

    if (!largestChat || !largestChat.file_name) return null;

    try {
        const context = getContext();
        const charId = context.characterId;
        const fullFileName = largestChat.file_name;
        const encodedFullFileName = encodeURIComponent(fullFileName); // Encode filename once

        let sampledMessages = null;

        // --- Attempt 1: Use characterId (avatar filename) ---
        console.log("fetchLargestChatFile: Attempt 1 using characterId:", charId);
        if (charId && typeof charId === 'string' && charId !== '0') {
            const lastDotIndex = charId.lastIndexOf('.');
            const folderNameFromId = lastDotIndex > 0 ? charId.substring(0, lastDotIndex) : charId;
            console.log("fetchLargestChatFile: Derived folder name from ID:", folderNameFromId);

            const filePathById = `/chats/${folderNameFromId}/${encodedFullFileName}`;
            console.log(`Attempt 1: Trying path: ${filePathById}`);
            try {
                const response = await fetch(filePathById, { credentials: 'same-origin' });
                if (response.ok) {
                    console.log(`Attempt 1: Success fetching ${filePathById}`);
                    const text = await response.text();
                    const lines = text.trim().split('\n');
                    sampledMessages = lines.slice(0, 100).map(line => JSON.parse(line));
                    return sampledMessages; // Success, return early
                } else {
                    console.warn(`Attempt 1: Failed fetching ${filePathById}, Status: ${response.status}. Trying fallback.`);
                }
            } catch (fetchError) {
                 console.warn(`Attempt 1: Error during fetch for ${filePathById}:`, fetchError, ". Trying fallback.");
            }
        } else {
             console.warn("Attempt 1: Invalid characterId found:", charId, ". Skipping ID-based path, trying fallback.");
        }

        // --- Attempt 2 (Fallback): Use encoded character name from filename ---
        console.log("fetchLargestChatFile: Attempt 2 using encoded character name from filename.");
        const characterNameFromName = fullFileName.split(' - ')[0];
        const encodedCharacterName = encodeURIComponent(characterNameFromName);
        const filePathByName = `/chats/${encodedCharacterName}/${encodedFullFileName}`; // Use encoded filename here too
        console.log(`Attempt 2: Trying path: ${filePathByName}`);
        try {
            const response = await fetch(filePathByName, { credentials: 'same-origin' });
            if (response.ok) {
                console.log(`Attempt 2: Success fetching ${filePathByName}`);
                const text = await response.text();
                const lines = text.trim().split('\n');
                sampledMessages = lines.slice(0, 100).map(line => JSON.parse(line));
                return sampledMessages; // Success
            } else {
                console.warn(`Attempt 2: Failed fetching ${filePathByName}, Status: ${response.status}. Giving up.`);
                return null; // Both attempts failed
            }
        } catch (fetchError) {
            console.error(`Attempt 2: Error during fetch for ${filePathByName}:`, fetchError, ". Giving up.");
            return null; // Both attempts failed
        }

    } catch (error) {
        console.error("Error in fetchLargestChatFile logic:", error);
        return null;
    }
  }

  // 从消息数据中获取统计信息
  function getStatsFromMessages(messages) {
    let userWords = 0, userSize = 0, userCount = 0;
    let charWords = 0, charSize = 0, charCount = 0;
    let userChineseRatio = 0, userEnglishRatio = 0;
    let charChineseRatio = 0, charEnglishRatio = 0;

    messages.forEach(message => {
      const content = message.mes || '';
      const isUser = message.is_user;
      const words = countWordsInMessage(content);
      
      // 计算中英文比例
      const chineseChars = content.match(/[\u4e00-\u9fff]/g) || [];
      const englishWords = content.match(/[a-zA-Z0-9]+/g) || [];
      const totalChars = chineseChars.length + englishWords.length;
      
      if (totalChars > 0) {
        const chineseRatio = chineseChars.length / totalChars;
        const englishRatio = englishWords.length / totalChars;
        
        if (isUser) {
          userChineseRatio += chineseRatio;
          userEnglishRatio += englishRatio;
        } else {
          charChineseRatio += chineseRatio;
          charEnglishRatio += englishRatio;
        }
      }

      const messageData = {
        content,
        is_user: isUser,
        ch_name: message.ch_name || '',
        send_date: message.send_date || ''
      };
      const messageSize = JSON.stringify(messageData).length + 2;

      if (isUser) {
        userWords += words;
        userSize += messageSize;
        userCount++;
      } else {
        charWords += words;
        charSize += messageSize;
        charCount++;
      }
    });

    // 计算平均中英文比例
    if (userCount > 0) {
      userChineseRatio /= userCount;
      userEnglishRatio /= userCount;
    }
    if (charCount > 0) {
      charChineseRatio /= charCount;
      charEnglishRatio /= charCount;
    }

    return {
      user: { 
        words: userWords, 
        size: userSize, 
        count: userCount,
        chineseRatio: userChineseRatio,
        englishRatio: userEnglishRatio
      },
      char: { 
        words: charWords, 
        size: charSize, 
        count: charCount,
        chineseRatio: charChineseRatio,
        englishRatio: charEnglishRatio
      }
    };
  }

  // 获取完整的统计数据
  async function getFullStats() {
    const context = getContext();
    const characterId = context.characterId;
    if (characterId === undefined) {
      console.log('未找到当前角色ID');
      return {
        messageCount: 0,
        wordCount: 0,
        firstTime: null,
        totalDuration: 0,
        totalSizeBytes: 0 // Change to return bytes
      };
    }

    try {
      const chats = await getPastCharacterChats(characterId);
      console.log('获取到的聊天记录:', chats);

      let totalMessagesFromChats = 0;
      let totalSizeKB = 0;
      let earliestTime = null;
      let totalDurationSeconds = 0;
      let totalSizeBytesRaw = 0; // Variable to store raw bytes

      chats.forEach(chat => {
        totalMessagesFromChats += chat.chat_items || 0;
        
        // 计算文件大小 (store raw bytes)
        let currentChatBytes = 0;
        const fileSizeStr = chat.file_size;

        if (fileSizeStr) {
            if (fileSizeStr.toLowerCase().endsWith('mb')) {
                currentChatBytes = parseFloat(fileSizeStr) * 1024 * 1024;
            } else if (fileSizeStr.toLowerCase().endsWith('kb')) {
                currentChatBytes = parseFloat(fileSizeStr) * 1024;
            } else {
                // Assume bytes if no unit or if it's just a number
                const sizeAsNumber = parseFloat(fileSizeStr);
                if (!isNaN(sizeAsNumber)) {
                    currentChatBytes = sizeAsNumber;
                } else {
                    console.warn(`Could not parse file size: ${fileSizeStr}`);
                }
            }
        }
        totalSizeBytesRaw += currentChatBytes;

        // --- Calculate totalSizeKB (for word count estimation) --- ADDED BACK
        // This specifically looks for the "KB" unit in the original string
        const sizeMatchKB_est = chat.file_size?.match(/([\d.]+)\s*KB/i);
        if (sizeMatchKB_est) {
          totalSizeKB += parseFloat(sizeMatchKB_est[1]);
        }
        // Note: We are intentionally *not* converting MB or Bytes here for the estimation logic,
        // as it historically relied only on the KB value provided by the API.


        // 获取最早时间 using the robust parser
        if (chat.last_mes) {
          console.log('Processing chat with last_mes:', chat.last_mes);
          const date = parseSillyTavernDate(chat.last_mes);
          console.log('Parsed date:', date);
          if (date) {
            if (!earliestTime || date < earliestTime) {
              earliestTime = date;
              console.log('Updated earliestTime to:', earliestTime);
            }
          } else if (chat.last_mes) {
            console.warn(`Could not parse date format: ${chat.last_mes}`);
          }
        }

        // 从文件名解析时间
        if (chat.file_name) {
          const timeInfo = parseTimeFromFilename(chat.file_name);
          if (timeInfo) {
            totalDurationSeconds += timeInfo.totalSeconds;
            console.log('Added duration from file:', timeInfo);
          }
        }
      });

      // 获取当前聊天的统计信息
      const currentStats = getCurrentChatStats();
      console.log('当前聊天统计:', currentStats);

      // 计算当前聊天的总字数和总大小
      const totalWords = currentStats.user.words + currentStats.char.words;
      const totalSizeBytes = currentStats.user.size + currentStats.char.size;
      const currentMessageCount = currentStats.user.count + currentStats.char.count;

      // 计算估算字数
      let estimatedWords = 0;

      // 如果当前聊天消息数量少（<=2）且有历史文件，使用基于历史元数据的估算
      if (currentMessageCount <= 2 && chats && chats.length > 0 && totalMessagesFromChats > 0) {
          console.log(`当前消息数 (${currentMessageCount}) <= 2，使用历史元数据估算...`);
          // 1. 使用默认密度估算历史总字数
          const historicalWordsEstimateFromSize = totalSizeKB * 30; // Default density
          // 2. 计算历史平均每条消息字数
          const historicalAvgWordsPerMessage = historicalWordsEstimateFromSize / totalMessagesFromChats;
          // 3. 使用历史平均字数 * 总历史消息数 作为最终估算
          estimatedWords = Math.round(totalMessagesFromChats * historicalAvgWordsPerMessage);

          console.log(`使用历史元数据估算:`);
          console.log(`- 历史文件: ${totalMessagesFromChats}条消息, ${totalSizeKB.toFixed(2)}KB`);
          console.log(`- 历史平均字数 (估算): ${historicalAvgWordsPerMessage.toFixed(2)}字/条`);
          console.log(`- 最终估算: ${estimatedWords}字`);
      }
      // 如果当前聊天有足够消息 (>2)，使用当前聊天综合估算 (区分用户/角色)
      else if (currentMessageCount > 2) {
        console.log(`当前消息数 (${currentMessageCount}) > 2，使用当前聊天综合估算...`);
        
        // Check if we have stats for both user and character in the current chat
        if (currentStats.user.count > 0 && currentStats.char.count > 0 && totalSizeBytes > 0) {
            console.log(`区分用户/角色进行估算...`);
            // Calculate separate stats based on current chat
            const userWordsPerKB = currentStats.user.size > 0 ? currentStats.user.words / (currentStats.user.size / 1024) : 0;
            const userAvgWords = currentStats.user.words / currentStats.user.count;
            const charWordsPerKB = currentStats.char.size > 0 ? currentStats.char.words / (currentStats.char.size / 1024) : 0;
            const charAvgWords = currentStats.char.words / currentStats.char.count;

            // Estimate historical split (simple 50/50 for messages, ratio-based for size)
            const histUserMessages = totalMessagesFromChats / 2;
            const histCharMessages = totalMessagesFromChats / 2;
            const currentUserSizeRatio = currentStats.user.size / totalSizeBytes;
            const histUserSizeKB = totalSizeKB * currentUserSizeRatio;
            const histCharSizeKB = totalSizeKB * (1 - currentUserSizeRatio);

            // Estimate using separate densities
            const densityEstimate = (histUserMessages * userWordsPerKB) + (histCharMessages * charWordsPerKB);
            // Estimate using separate averages
            const avgEstimate = (histUserMessages * userAvgWords) + (histCharMessages * charAvgWords);

            // Use the minimum of the two refined estimates
            estimatedWords = Math.min(Math.round(densityEstimate), Math.round(avgEstimate));

            console.log(`使用区分用户/角色的综合估算:`);
            console.log(`- 当前用户: ${currentStats.user.words.toFixed(1)}字, ${(currentStats.user.size/1024).toFixed(2)}KB, ${currentStats.user.count}条`);
            console.log(`  - 用户密度: ${userWordsPerKB.toFixed(2)}字/KB, 用户平均: ${userAvgWords.toFixed(2)}字/条`);
            console.log(`- 当前角色: ${currentStats.char.words.toFixed(1)}字, ${(currentStats.char.size/1024).toFixed(2)}KB, ${currentStats.char.count}条`);
            console.log(`  - 角色密度: ${charWordsPerKB.toFixed(2)}字/KB, 角色平均: ${charAvgWords.toFixed(2)}字/条`);
            console.log(`- 历史文件: ${totalMessagesFromChats}条消息, ${totalSizeKB.toFixed(2)}KB`);
            console.log(`  - 估算历史用户: ${histUserMessages.toFixed(0)}条, ${histUserSizeKB.toFixed(2)}KB`);
            console.log(`  - 估算历史角色: ${histCharMessages.toFixed(0)}条, ${histCharSizeKB.toFixed(2)}KB`);
            console.log(`- 密度估算(分开): ${Math.round(densityEstimate)}字`);
            console.log(`- 平均估算(分开): ${Math.round(avgEstimate)}字`);
            console.log(`- 最终估算(取较小值): ${estimatedWords}字`);

        } else {
            // Fallback to simpler combined estimation if current chat is one-sided or has zero size
            console.log(`当前聊天样本不均衡或大小为零，回退到简单综合估算...`);
            const wordsPerKB = totalSizeBytes > 0 ? totalWords / (totalSizeBytes / 1024) : 0;
            const avgWordsPerMessage = totalWords / currentMessageCount;
            const estimateByDensity = totalSizeKB * wordsPerKB;
            const estimateByAvgWords = avgWordsPerMessage * totalMessagesFromChats;
            estimatedWords = Math.min(Math.round(estimateByDensity), Math.round(estimateByAvgWords));

            console.log(`使用简单综合估算:`);
            console.log(`- 当前聊天: ${totalWords}字, ${(totalSizeBytes/1024).toFixed(2)}KB, ${currentMessageCount}条消息`);
            console.log(`- 历史文件: ${totalMessagesFromChats}条消息, ${totalSizeKB.toFixed(2)}KB`);
            console.log(`- 字数密度: ${wordsPerKB.toFixed(2)}字/KB`);
            console.log(`- 平均字数: ${avgWordsPerMessage.toFixed(2)}字/条`);
            console.log(`- 密度估算: ${Math.round(estimateByDensity)}字`);
            console.log(`- 平均估算: ${Math.round(avgWordsPerMessage)}字`);
            console.log(`- 最终估算(取较小值): ${estimatedWords}字`);
        }
        console.log(`中英文比例 - 用户: 中文 ${(currentStats.user.chineseRatio * 100).toFixed(1)}%, 英文 ${(currentStats.user.englishRatio * 100).toFixed(1)}%`);
        console.log(`中英文比例 - 角色: 中文 ${(currentStats.char.chineseRatio * 100).toFixed(1)}%, 英文 ${(currentStats.char.englishRatio * 100).toFixed(1)}%`);

      } else {
        // 兜底方案：用totalSizeKB × 30
        estimatedWords = Math.round(totalSizeKB * 30);
        console.log(`无采样数据，采用大小估算: ${estimatedWords}`);
      }

      console.log('统计结果:', {
        totalMessages: totalMessagesFromChats,
        estimatedWords,
        earliestTime: (earliestTime && !isNaN(earliestTime.getTime())) ? earliestTime.toISOString() : null,
        totalDurationSeconds,
        totalSizeBytes: totalSizeBytesRaw // Include raw bytes in final log
      });

      // Additional check: If multiple files exist, are他们 all minimal (<=1 message)?
      let allFilesAreMinimal = false;
      if (chats && chats.length > 1) {
          allFilesAreMinimal = chats.every(chat => (chat.chat_items || 0) <= 1);
          if (allFilesAreMinimal) {
              console.log(`检测到多个聊天文件，但每个文件消息数都 <= 1。`);
          }
      }

      // Final check: Treat as no interaction if total messages <= 1 OR if all files are minimal
      if (totalMessagesFromChats <= 1 || allFilesAreMinimal) {
          console.log(`总消息数 (${totalMessagesFromChats}) <= 1 或所有文件消息数均 <= 1，重置统计数据为“尚未互动”状态。`);
          return {
              messageCount: 0,
              wordCount: 0,
              firstTime: null,
              totalDuration: 0,
              totalSizeBytes: 0 
          };
      }

      // Otherwise, return the calculated stats
      return {
        messageCount: totalMessagesFromChats,
        wordCount: estimatedWords,
        firstTime: earliestTime,
        totalDuration: totalDurationSeconds,
        totalSizeBytes: totalSizeBytesRaw // Return raw bytes
      };
    } catch (error) {
      console.error('获取统计数据失败:', error);
      return {
        messageCount: 0,
        wordCount: 0,
        firstTime: null,
        totalDuration: 0,
        totalSizeBytes: 0 // Return default on error
      };
    }
  }

  // Debounce function
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // 添加控制分享按钮状态的函数 (优先处理无互动状态)
  function updateShareButtonState(messageCount) {
    const $shareButton = $("#ccs-share");

    // Priority Check: Disable if total message count is 1 or less
    if (messageCount <= 1) {
      $shareButton.prop('disabled', true).val('尚未互动');
      console.log('updateShareButtonState: Disabled (messageCount <= 1)');
      return; 
    }

    // If interaction exists (messageCount > 1), check if options are selected
    const anyOptionChecked = $('.ccs-share-option input[type="checkbox"]:checked').length > 0;

    if (anyOptionChecked) {
      $shareButton.prop('disabled', false).val('分享');
      console.log('updateShareButtonState: Enabled (options checked)');
    } else {
      $shareButton.prop('disabled', true).val('请选择内容');
      console.log('updateShareButtonState: Disabled (no options checked)');
    }
  }

  // 添加控制分享按钮状态的函数 (优先处理无互动状态)
  function updateCurrentShareButtonState(messageCount) {
    const $shareButton = $("#ccs-current-share");

    // Priority Check: Disable if total message count is 1 or less
    if (messageCount <= 1) {
      $shareButton.prop('disabled', true).val('尚未互动');
      console.log('updateCurrentShareButtonState: Disabled (messageCount <= 1)');
      return; 
    }

    // If interaction exists (messageCount > 1), check if options are selected
    const anyOptionChecked = $('#current-conversation-tab .ccs-share-option input[type="checkbox"]:checked').length > 0;

    if (anyOptionChecked) {
      $shareButton.prop('disabled', false).val('分享');
      console.log('updateCurrentShareButtonState: Enabled (options checked)');
    } else {
      $shareButton.prop('disabled', true).val('请选择内容');
      console.log('updateCurrentShareButtonState: Disabled (no options checked)');
    }
  }

  // 添加控制提示显示的函数
  function updateTipVisibility(messageCount, chatFilesCount) {
    const $tip = $("#ccs-tip");
    if (messageCount <= 2 && chatFilesCount > 1) {
      $tip.show();
    } else {
      $tip.hide();
    }
  }

  async function updateStats() {
    console.log('Attempting to update stats...');
    const characterName = getCurrentCharacterName();
    $("#ccs-character").text(characterName);
    try {
      const context = getContext();
      const stats = await getFullStats();
      console.log('Stats received in updateStats:', stats);

      // 获取聊天文件数量
      const chats = await getPastCharacterChats(context.characterId);
      const chatFilesCount = chats ? chats.length : 0;

      // 始终显示字数估算提示
      $("#ccs-tip").show();

      // 更新统计数据到UI
      $("#ccs-messages").text(stats.messageCount || 0);
      $("#ccs-words").text(stats.wordCount || 0);

      // Format total size dynamically (KB or MB)
      let formattedSize = '--';
      if (stats.totalSizeBytes !== undefined && stats.totalSizeBytes >= 0) {
          const bytes = stats.totalSizeBytes;
          const kb = bytes / 1024;
          const mb = kb / 1024;

          if (mb >= 1) {
              formattedSize = `${mb.toFixed(2)} MB`;
          } else if (kb >= 1) {
              formattedSize = `${kb.toFixed(2)} KB`;
          } else {
              formattedSize = `${bytes} B`; // Display bytes if less than 1 KB
          }
      }
      $("#ccs-total-size").text(formattedSize);


      if (!stats.firstTime) {
        console.log('No firstTime found in stats');
        $("#ccs-start").text("尚未互动");
        $("#ccs-days").text("0");
        // Pass messageCount even if firstTime is null
        updateShareButtonState(stats.messageCount); 
      } else {
        const now = new Date();
        // Ensure stats.firstTime is a Date object
        const firstTimeDate = stats.firstTime instanceof Date ? stats.firstTime : new Date(stats.firstTime);
        console.log('First time date:', firstTimeDate);
        
        // 使用 UTC 日期来避免时区问题
        const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        const utcFirstTime = Date.UTC(firstTimeDate.getFullYear(), firstTimeDate.getMonth(), firstTimeDate.getDate());
        
        // 计算天数：从第一次互动到现在的天数（包括今天）
        const diffTime = Math.abs(utcNow - utcFirstTime);
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // 加1确保包括今天
        console.log('Calculated days:', days);
        
        // 格式化初遇时间
        const firstTimeFormatted = formatDateTime(stats.firstTime);
        console.log('Formatted first time:', firstTimeFormatted);

        $("#ccs-start").text(firstTimeFormatted);
        $("#ccs-days").text(days);
        // Pass messageCount to the state function
        updateShareButtonState(stats.messageCount); 
      }
      // Removed the stray 'else' block that was here


      console.log('Stats UI updated:', {
        messages: stats.messageCount,
        words: stats.wordCount,
        firstTime: stats.firstTime,
        days: $("#ccs-days").text()
      });

    } catch (error) {
      console.error('更新统计数据失败:', error);
      // 显示错误状态
      $("#ccs-messages").text('--');
      $("#ccs-words").text('--');
      $("#ccs-start").text('--');
      $("#ccs-days").text('--');
      $("#ccs-total-size").text('--'); // Clear size on error too
      updateShareButtonState(0); // Pass 0 on error to ensure disabled state
    }
  }

  function getCharacterAvatar() {
    const messages = document.querySelectorAll('#chat .mes');
    for (const msg of messages) {
      const isUser = msg.getAttribute('is_user') === 'true';
      if (!isUser) {
        const avatar = msg.querySelector('.avatar img');
        if (avatar) {
          return avatar.src;
        }
      }
    }
    return null;
  }

  function getUserAvatar() {
    // Priority 1: Try to get avatar from current chat messages
    const messages = document.querySelectorAll('#chat .mes');
    for (const msg of messages) {
      const isUser = msg.getAttribute('is_user') === 'true';
      if (isUser) {
        const avatar = msg.querySelector('.avatar img');
        if (avatar && avatar.src) {
          console.log("getUserAvatar: Found avatar in chat message.");
          return avatar.src;
        }
      }
    }

    // Priority 2 (Fallback): Try to get avatar from persona selection
    const userAvatarContainer = document.querySelector('.avatar-container[data-avatar-id="user-default.png"]');
    if (userAvatarContainer) {
      const avatar = userAvatarContainer.querySelector('img');
      if (avatar && avatar.src) {
        console.log("getUserAvatar: Found avatar in persona selection.");
        return avatar.src;
      }
    }
    
    console.log("getUserAvatar: Could not find user avatar.");
    return null; // Return null if not found in either place
  }

  // Function to generate share image for a given tab
  async function generateShareImage(tabType, avatarSectionBgColor, avatarDecorationColor, textSectionBgColor, textColor, avatarShape) {
    const canvasId = tabType === 'total' ? 'ccs-canvas' : 'ccs-current-canvas';
    const characterNameId = tabType === 'total' ? 'ccs-character' : 'ccs-current-character';
    const startDateId = tabType === 'total' ? 'ccs-start' : 'ccs-current-start';
    const messagesId = tabType === 'total' ? 'ccs-messages' : 'ccs-current-messages';
    const wordsId = tabType === 'total' ? 'ccs-words' : 'ccs-current-words';
    const daysId = tabType === 'total' ? 'ccs-days' : 'ccs-current-days';
    const totalSizeId = tabType === 'total' ? 'ccs-total-size' : 'ccs-current-total-size';
    const shareStartId = tabType === 'total' ? 'ccs-share-start' : 'ccs-current-share-start';
    const shareMessagesId = tabType === 'total' ? 'ccs-share-messages' : 'ccs-current-share-messages';
    const shareWordsId = tabType === 'total' ? 'ccs-share-words' : 'ccs-current-share-words';
    const shareDaysId = tabType === 'total' ? 'ccs-share-days' : 'ccs-current-share-days';
    const shareSizeId = tabType === 'total' ? 'ccs-share-size' : 'ccs-current-share-size';
    const shareUserAvatarId = tabType === 'total' ? 'ccs-share-user-avatar' : 'ccs-current-share-user-avatar';

    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    const baseWidth = 1200; // Keep width fixed

    // --- Define constants for layout ---
    const avatarSectionHeight = 450; // Reduced height of the top avatar section
    const textSectionPadding = 80; // Padding for the text section
    const lineHeight = 90;      // Height per stat line
    const titleY = avatarSectionHeight + 100; // Y position for "我的羁绊" title
    const dividerY = titleY + 60; // Y position for divider below title
    const statsStartY = dividerY + 80; // Y position for first stat line
    const dateYOffset = 40; // Offset for date from last stat line
    const bottomTextPadding = 80; // Padding below the date

    // --- Get stat values ---
    const characterName = $(`#${characterNameId}`).text();
    const startDate = $(`#${startDateId}`).text();
    const messages = $(`#${messagesId}`).text();
    const words = $(`#${wordsId}`).text();
    const days = $(`#${daysId}`).text();
    const totalSize = $(`#${totalSizeId}`).text(); // Get the formatted size from UI

    // --- Build array of STAT lines to draw based on selections ---
    const statsToDraw = [];
    const shareStartChecked = $(`#${shareStartId}`).is(":checked");

    if (shareStartChecked) {
        statsToDraw.push(`与 ${characterName} 初遇于`);
        statsToDraw.push(startDate);
    } else {
        statsToDraw.push(`与 ${characterName}`);
    }
    if ($(`#${shareMessagesId}`).is(":checked")) {
        statsToDraw.push(`共对话 ${messages} 条`);
    }
    if ($(`#${shareWordsId}`).is(":checked")) {
        statsToDraw.push(`共聊天约 ${words} 字`);
    }
    if ($(`#${shareDaysId}`).is(":checked")) {
        statsToDraw.push(`相伴 ${days} 天`);
    }
    // Add the new "回忆大小" stat if the corresponding UI element has a value, using the correct format
    if (totalSize && totalSize !== '--' && $(`#${shareSizeId}`).is(":checked")) { // Check a new checkbox ID
        // Ensure the format is "回忆大小: X.XX MB/KB/B"
        statsToDraw.push(`回忆大小 ${totalSize}`); // totalSize already includes the formatted size and unit from updateStats
    }

    // --- Calculate dynamic height ---
    // Calculate the Y position of the bottom-most text element (the date)
    const finalDateY = statsStartY + (statsToDraw.length * lineHeight) + dateYOffset;
    // The total height is the finalDateY plus the bottom padding
    const calculatedHeight = finalDateY + bottomTextPadding;

    // --- Set canvas dimensions ---
    canvas.width = baseWidth;
    canvas.height = calculatedHeight; // Set dynamic height

    // --- Start Drawing ---
    // Draw overall background (transparent)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const outerRadius = 32; // Desired outer border radius

    // Draw avatar section background (top part)
    ctx.fillStyle = hexToRgba(avatarSectionBgColor);
    drawRoundedRect(ctx, 0, 0, canvas.width, avatarSectionHeight, outerRadius, true, false);
    ctx.fill();

    // Draw text section background (bottom part)
    ctx.fillStyle = hexToRgba(textSectionBgColor);
    drawRoundedRect(ctx, 0, avatarSectionHeight, canvas.width, calculatedHeight - avatarSectionHeight, outerRadius, false, true);
    ctx.fill();

    // Helper function to draw rounded rectangles with specific corners
    function drawRoundedRect(ctx, x, y, width, height, radius, roundTop = true, roundBottom = true) {
        ctx.beginPath();
        // Top left corner
        if (roundTop) {
            ctx.moveTo(x + radius, y);
        } else {
            ctx.moveTo(x, y);
        }
        // Top right corner
        if (roundTop) {
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        } else {
            ctx.lineTo(x + width, y);
        }
        // Bottom right corner
        if (roundBottom) {
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        } else {
            ctx.lineTo(x + width, y + height);
        }
        // Bottom left corner
        if (roundBottom) {
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        } else {
            ctx.lineTo(x, y + height);
        }
        // Top left corner (continued)
        if (roundTop) {
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
        } else {
            ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    // 加载头像
    const avatarUrl = getCharacterAvatar();
    const userAvatarUrl = getUserAvatar();

    const spacing = 400; // Spacing between avatars
    let avatarWidth = 200; // Default Avatar width
    let avatarHeight = 280; // Default Avatar height
    let avatarBorderRadius = 20; // Default Avatar border radius

    // Adjust avatar dimensions based on shape
    if (avatarShape === 'square') {
        avatarWidth = 240; // Make it a square
        avatarHeight = 240;
        avatarBorderRadius = 20; // Keep some rounding for square
    } else if (avatarShape === 'circle') {
        avatarWidth = 240; // Make it a circle
        avatarHeight = 240;
        avatarBorderRadius = avatarWidth / 2; // Half of width for perfect circle
    } else { // rectangle
        avatarWidth = 200;
        avatarHeight = 280;
        avatarBorderRadius = 20;
    }

    // Calculate avatarY dynamically to center vertically within avatarSectionHeight, with a slight downward bias
    const avatarY = (avatarSectionHeight - avatarHeight) / 2;

    // 预加载两个头像
    let characterAvatar = null;
    let userAvatar = null;
    
    if (avatarUrl) {
      try {
        characterAvatar = await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = avatarUrl;
        });
      } catch (error) {
        console.error('加载角色头像失败:', error);
      }
    }
    
    if (userAvatarUrl) {
      try {
        userAvatar = await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = userAvatarUrl;
        });
      } catch (error) {
        console.error('加载用户头像失败:', error);
      }
    }

    // 绘制心形符号
    function drawHeartSymbol(x, y, size, color) {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.moveTo(0, size * 0.25); // Start point (top center)
        // Left curve
        ctx.bezierCurveTo(size * 0.4, -size * 0.2, size * 0.7, size * 0.3, 0, size * 1.0);
        // Right curve
        ctx.bezierCurveTo(-size * 0.7, size * 0.3, -size * 0.4, -size * 0.2, 0, size * 0.25);
        ctx.fillStyle = hexToRgba(color);
        ctx.fill();
        ctx.restore();
    }

    // 绘制头像函数
    function drawAvatar(img, x, y, width, height, radius, borderColor, shape) {
      ctx.strokeStyle = hexToRgba(borderColor); // Use hexToRgba
      ctx.lineWidth = 9; // Increased border width for avatars by 1px

      ctx.save();
      ctx.beginPath();
      if (shape === 'circle') {
          const centerX = x + width / 2;
          const centerY = y + height / 2;
          const circleRadius = Math.min(width, height) / 2;
          ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2, false);
      } else { // rectangle or square
          drawRoundedRect(ctx, x, y, width, height, radius);
      }
      ctx.closePath();
      ctx.stroke(); // Draw border
      ctx.clip(); // Clip for image

      // 绘制头像
      if (img) {
        const scale = Math.max(width / img.width, height / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const drawX = x + (width - scaledWidth) / 2;
        const drawY = y + (height - scaledHeight) / 2;
        ctx.drawImage(img, drawX, drawY, scaledWidth, scaledHeight);
      }
      ctx.restore();
    }

    const showUserAvatar = $(`#${shareUserAvatarId}`).is(":checked");

    if (showUserAvatar) {
        // Draw both avatars with spacing
        const leftX = canvas.width / 2 - spacing / 2 - avatarWidth;
        const rightX = canvas.width / 2 + spacing / 2;
        drawAvatar(userAvatar, leftX, avatarY, avatarWidth, avatarHeight, avatarBorderRadius, avatarDecorationColor, avatarShape);
        drawAvatar(characterAvatar, rightX, avatarY, avatarWidth, avatarHeight, avatarBorderRadius, avatarDecorationColor, avatarShape);
        
        // Draw connecting line and heart symbol
        const lineY = avatarY + avatarHeight / 2;
        const lineStartX = leftX + avatarWidth; // Connect directly to avatar
        const lineEndX = rightX; // Connect directly to avatar

        // Draw dashed line
        ctx.beginPath();
        ctx.strokeStyle = hexToRgba(avatarDecorationColor); // Use hexToRgba
        ctx.lineWidth = 5; // Increased by 1px
        ctx.setLineDash([20, 10]); // Dashed pattern
        ctx.moveTo(lineStartX, lineY);
        ctx.lineTo(lineEndX, lineY);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash

        // Draw heart symbol (adjusted Y position)
        drawHeartSymbol(canvas.width / 2, lineY - 38, 84, avatarDecorationColor); // Heart size 80, moved up by 40
    } else {
        // Draw only character avatar, centered
        const centerX = canvas.width / 2;
        const charAvatarX = centerX - avatarWidth / 2;
        drawAvatar(characterAvatar, charAvatarX, avatarY, avatarWidth, avatarHeight, avatarBorderRadius, avatarDecorationColor, avatarShape);
    }
    
    // 设置文本样式
    ctx.textAlign = 'center';
    ctx.fillStyle = hexToRgba(textColor); // Use hexToRgba

    // 绘制标题
    ctx.font = 'bold 64px Arial';
    ctx.fillText('我的羁绊', canvas.width / 2, titleY);

    // 绘制标题下方的虚线
    ctx.beginPath();
    ctx.strokeStyle = hexToRgba(avatarSectionBgColor); // Same color as avatar section background, use hexToRgba
    ctx.lineWidth = 4;
    ctx.setLineDash([20, 10]);
    ctx.moveTo(canvas.width / 2 - 200, dividerY); // Adjust line length
    ctx.lineTo(canvas.width / 2 + 200, dividerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 绘制统计信息
    ctx.font = '52px Arial';
    statsToDraw.forEach((text, index) => {
      const currentY = statsStartY + index * lineHeight;
      ctx.fillText(text, canvas.width / 2, currentY);
    });

    // 绘制当前日期
    ctx.font = 'italic 40px Arial'; // Small and italic
    ctx.fillStyle = hexToRgba(textColor); // Use hexToRgba
    const currentDate = new Date();
    const formattedDate = `${currentDate.getFullYear()}/${(currentDate.getMonth() + 1).toString().padStart(2, '0')}/${currentDate.getDate().toString().padStart(2, '0')}`;
    ctx.fillText(formattedDate, canvas.width / 2, finalDateY + 6); // Adjusted Y position for date
    
    return canvas.toDataURL('image/png');
  }

  async function showPreview(tabType) { // Modified to accept tabType
    const $modal = $("#ccs-preview-modal");
    const $container = $("#ccs-preview-container");
    
    // Get current color values from pickers
    const avatarSectionBgColor = $("#ccs-avatar-section-bg-color").val();
    const avatarDecorationColor = $("#ccs-avatar-decoration-color").val();
    const textSectionBgColor = $("#ccs-text-section-bg-color").val();
    const textColor = $("#ccs-text-color").val(); // Get text color
    const avatarShape = $("#ccs-avatar-style").val(); // Get avatar shape

    // Generate image with current colors
    const imageData = await generateShareImage(tabType, avatarSectionBgColor, avatarDecorationColor, textSectionBgColor, textColor, avatarShape);

    // Clear previous content
    $container.empty();
    
    // Create preview image
    const img = new Image();
    img.src = imageData;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.borderRadius = '16px';
    
    // Add to container
    $container.append(img);
    
    // Show modal
    $("#ccs-modal-overlay").css('display', 'flex');
    $('body').addClass('no-scroll'); // Add no-scroll class to body
    $('html').addClass('no-scroll'); // Add no-scroll class to html
    $modal.scrollTop(0); // Scroll modal to top
  }

  // 添加刷新按钮事件处理
  $("#ccs-refresh").on("click", async function() {
    const $button = $(this);
    
    // 禁用按钮并显示更新中状态
    $button.prop('disabled', true).val('更新中...');
    
    try {
      // 更新统计
      await updateStats();

      // 显示更新成功状态
      $button.val('已更新');
    } catch (error) {
      console.error('更新统计数据失败:', error);
      $button.val('更新失败');
    } finally {
      // 恢复按钮状态
      setTimeout(() => {
        $button.prop('disabled', false).val('刷新');
      }, 800);
    }
  });

  // Add a variable to keep track of the currently active tab for the preview modal
  let currentPreviewTabType = 'total'; // Default to 'total'

  // 添加分享按钮事件处理 (总对话)
  $("#ccs-share").on("click", async function() {
    const $button = $(this);
    if ($button.prop('disabled')) return;
    
    $button.prop('disabled', true).val('生成中...');
    
    try {
      currentPreviewTabType = 'total'; // Set active tab for preview
      await showPreview('total'); // Call showPreview directly
      $button.val('已生成');
    } catch (error) {
      console.error('生成分享图片失败:', error);
    } finally {
      setTimeout(() => {
        $button.prop('disabled', false).val('分享');
      }, 1000);
    }
  });

  // 添加分享按钮事件处理 (当前对话)
  $("#ccs-current-share").on("click", async function() {
    const $button = $(this);
    if ($button.prop('disabled')) return;
    
    $button.prop('disabled', true).val('生成中...');
    
    try {
      currentPreviewTabType = 'current'; // Set active tab for preview
      await showPreview('current'); // Call showPreview directly
      $button.val('已生成');
    } catch (error) {
      console.error('生成分享图片失败:', error);
    } finally {
      setTimeout(() => {
        $button.prop('disabled', false).val('分享');
      }, 1000);
    }
  });

  // Function to re-render the preview image with current color settings
  async function updatePreviewImage() {
    if ($("#ccs-preview-modal").is(":visible")) {
      await showPreview(currentPreviewTabType);
    }
  }

  // Add change listeners to color pickers for real-time updates
  $("#ccs-avatar-section-bg-color, #ccs-avatar-decoration-color, #ccs-text-section-bg-color, #ccs-text-color").on("input", function() {
    const $presetDropdown = $("#ccs-color-preset");
    if ($presetDropdown.val() !== "custom") { // Only change to custom if not already custom
        $presetDropdown.val("custom");
        updateCustomPresetButtonsVisibility(); // Update button visibility when changing to custom
    }
    debounce(updatePreviewImage, 100)();
  });

  // Add change listener to avatar style dropdown for real-time updates
  $("#ccs-avatar-style").on("change", function() {
    debounce(updatePreviewImage, 100)();
  });

  // Set default avatar style on load
  $("#ccs-avatar-style").val("rectangle");

  // 添加取消按钮事件处理
  $("#ccs-cancel").on("click", function() {
    $("#ccs-modal-overlay").hide();
    $('body').removeClass('no-scroll'); // Remove no-scroll class from body
    $('html').removeClass('no-scroll'); // Remove no-scroll class from html
  });

  // 添加保存按钮事件
  $("#ccs-download").on("click", function() {
    const characterName = getCurrentCharacterName();
    const link = document.createElement('a');
    link.download = `羁绊卡片_${characterName}.png`;
    link.href = $("#ccs-preview-container img").attr('src');
    link.click();
  });

  // 点击模态框背景关闭
  $("#ccs-modal-overlay").on("click", function(e) {
    if (e.target === this) {
      $("#ccs-modal-overlay").hide();
      $('body').removeClass('no-scroll'); // Remove no-scroll class from body
      $('html').removeClass('no-scroll'); // Remove no-scroll class from html
    }
  });

  // Define built-in color presets
  const builtInColorPresets = {
    'preset-bluewhite': {
      avatarSectionBgColor: '#5884E7',
      avatarDecorationColor: '#ABC1F3',
      textSectionBgColor: '#FFFFFF',
      textColor: '#000000'
    },
    'preset-greenyellow': {
      avatarSectionBgColor: '#CCC994',
      avatarDecorationColor: '#F8F1E7',
      textSectionBgColor: '#F8F1E7',
      textColor: '#000000'
    },
    'preset-bluegray': {
      avatarSectionBgColor: '#375A8D',
      avatarDecorationColor: '#6A90CA',
      textSectionBgColor: '#36383E',
      textColor: '#FFFFFF'
    },
    'preset-pinkwhite': {
      avatarSectionBgColor: '#FB9EBB',
      avatarDecorationColor: '#FDF1F4',
      textSectionBgColor: '#FDF1F4',
      textColor: '#000000'
    }
  };

  let customColorPresets = []; // Global variable to store custom presets

  // Function to load custom presets from localStorage
  function loadCustomPresets() {
    try {
      const storedPresets = localStorage.getItem('ccsCustomColorPresets');
      customColorPresets = storedPresets ? JSON.parse(storedPresets) : [];
    } catch (e) {
      console.error("Error loading custom presets from localStorage:", e);
      customColorPresets = [];
    }
  }

  // Function to save custom presets to localStorage
  function saveCustomPresets() {
    try {
      localStorage.setItem('ccsCustomColorPresets', JSON.stringify(customColorPresets));
    } catch (e) {
      console.error("Error saving custom presets to localStorage:", e);
    }
  }

  // Function to update the preset dropdown
  function updatePresetDropdown() {
    const $select = $("#ccs-color-preset");

    // Clear existing custom options
    $select.find('option[value^="custom-"]').remove();

    // Add custom presets to dropdown
    customColorPresets.forEach((preset, index) => {
      const optionValue = `custom-${index}`;
      $select.append(`<option value="${optionValue}">${preset.name}</option>`);
    });

    // Ensure "custom" option is always last
    $select.append($select.find('option[value="custom"]'));
  }

  // Function to update visibility of custom preset buttons
  function updateCustomPresetButtonsVisibility() {
    const selectedPreset = $("#ccs-color-preset").val();
    const $addBtn = $("#ccs-add-custom-preset");
    const $deleteBtn = $("#ccs-delete-selected-preset");
    const $inputArea = $("#ccs-custom-preset-input-area");

    $inputArea.hide(); // Always hide input area initially

    if (selectedPreset === "custom") {
      $addBtn.show();
      $deleteBtn.hide();
    } else if (selectedPreset.startsWith("custom-")) {
      $addBtn.hide();
      $deleteBtn.show();
    } else {
      $addBtn.hide();
      $deleteBtn.hide();
    }
  }

  // Function to apply a preset (built-in or custom)
  function applyPreset(presetName) {
    let preset = builtInColorPresets[presetName];
    if (!preset && presetName.startsWith('custom-')) {
      const index = parseInt(presetName.split('-')[1], 10);
      preset = customColorPresets[index];
    }

    if (preset) {
      $("#ccs-avatar-section-bg-color").val(preset.avatarSectionBgColor);
      $("#ccs-avatar-decoration-color").val(preset.avatarDecorationColor);
      $("#ccs-text-section-bg-color").val(preset.textSectionBgColor);
      $("#ccs-text-color").val(preset.textColor);

      updatePreviewImage(); // Update the preview after applying preset
    }
    updateCustomPresetButtonsVisibility(); // Update button visibility after applying preset
  }

  // Function to convert hex to rgba, supporting 8-digit hex for alpha
  function hexToRgba(hex, defaultAlpha = 1) {
    let r = 0, g = 0, b = 0, a = defaultAlpha;

    if (hex.length === 9) { // #RRGGBBAA
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
      a = parseInt(hex.slice(7, 9), 16) / 255;
    } else if (hex.length === 7) { // #RRGGBB
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    } else if (hex.length === 4) { // #RGB
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // Set default preset on load and load custom presets
  loadCustomPresets();
  updatePresetDropdown();
  $("#ccs-color-preset").val("preset-bluewhite");
  applyPreset("preset-bluewhite"); // Apply default preset colors

  // Add change listener to the preset dropdown
  $("#ccs-color-preset").on("change", function() {
    const selectedPreset = $(this).val();
    if (selectedPreset !== "custom") {
      applyPreset(selectedPreset);
    }
    updateCustomPresetButtonsVisibility();
  });

  // Event listener for showing custom preset input
  $("#ccs-add-custom-preset").on("click", function() {
    $("#ccs-custom-preset-input-area").show();
    $("#ccs-add-custom-preset").hide();
    $("#ccs-delete-selected-preset").hide();
  });

  // Event listener for saving custom preset
  $("#ccs-save-custom-preset").on("click", function() {
    const presetName = $("#ccs-custom-preset-name").val().trim();
    if (!presetName) {
      alert("请输入自定义预设名称！");
      return;
    }

    const newPreset = {
      name: presetName,
      avatarSectionBgColor: $("#ccs-avatar-section-bg-color").val(),
      avatarDecorationColor: $("#ccs-avatar-decoration-color").val(),
      textSectionBgColor: $("#ccs-text-section-bg-color").val(),
      textColor: $("#ccs-text-color").val()
    };

    customColorPresets.push(newPreset);
    saveCustomPresets();
    updatePresetDropdown();
    $("#ccs-custom-preset-name").val(""); // Clear input
    $("#ccs-custom-preset-input-area").hide(); // Hide input area
    $("#ccs-color-preset").val(`custom-${customColorPresets.length - 1}`); // Select the newly saved preset
    applyPreset(`custom-${customColorPresets.length - 1}`); // Apply the new preset
  });

  // Event listener for deleting selected custom preset
  $("#ccs-delete-selected-preset").on("click", function() {
    const selectedPreset = $("#ccs-color-preset").val();
    if (selectedPreset.startsWith("custom-")) {
      const indexToDelete = parseInt(selectedPreset.split('-')[1], 10);
      if (confirm(`确定要删除预设 "${customColorPresets[indexToDelete].name}" 吗？`)) {
        customColorPresets.splice(indexToDelete, 1);
        saveCustomPresets();
        updatePresetDropdown();
        $("#ccs-color-preset").val("custom"); // Set to custom after deleting
        updatePreviewImage(); // Refresh preview
        updateCustomPresetButtonsVisibility(); // Update button visibility
      }
    }
  });

  // Debounced update function
  const debouncedUpdateStats = debounce(updateStats, 500); // 500ms delay

  // Function to update current chat stats
  async function updateCurrentChatStats() {
    const characterName = getCurrentCharacterName();
    $("#ccs-current-character").text(characterName);

    const context = getContext();
    const characterId = context.characterId;
    
    // Use getCurrentChatId() for the most reliable current chat ID
    const currentChatId = SillyTavern.getContext().getCurrentChatId(); 
    console.log('DEBUG: updateCurrentChatStats called.');
    console.log('DEBUG: context.characterId:', characterId);
    console.log('DEBUG: currentChatId from getCurrentChatId():', currentChatId);

    let currentChatFile = null;
    let currentChatMessagesCount = 0;
    let currentChatFileSizeText = '--';
    let currentChatFirstTime = "尚未互动";
    let currentChatDays = "0";
    let currentChatWords = 0;

    if (characterId !== undefined && currentChatId !== undefined) {
        try {
            const chats = await getPastCharacterChats(characterId);
            console.log('DEBUG: Fetched all past chats:', chats);
            // Append .jsonl to currentChatId for accurate matching
            // Ensure currentChatId does not have .jsonl for comparison
            const baseCurrentChatId = currentChatId.endsWith('.jsonl') ? currentChatId.replace(/\.jsonl$/, '') : currentChatId;
            console.log('DEBUG: baseCurrentChatId for comparison:', baseCurrentChatId);
            currentChatFile = chats.find(chat => {
                const chatFileNameWithoutExtension = chat.file_name.replace(/\.jsonl$/, '');
                console.log(`DEBUG: Comparing "${chatFileNameWithoutExtension}" with "${baseCurrentChatId}"`);
                console.log(`DEBUG: Result of comparison: ${chatFileNameWithoutExtension === baseCurrentChatId}`);
                return chatFileNameWithoutExtension === baseCurrentChatId;
            });
            console.log('DEBUG: Found currentChatFile after find operation:', currentChatFile);

            if (currentChatFile) {
                currentChatMessagesCount = currentChatFile.chat_items || 0;
                console.log('DEBUG: currentChatMessagesCount from currentChatFile:', currentChatMessagesCount);
                
                let currentChatFileBytes = 0;
                const currentChatFileSizeStr = currentChatFile.file_size;

                if (currentChatFileSizeStr) {
                    if (currentChatFileSizeStr.toLowerCase().endsWith('mb')) {
                        currentChatFileBytes = parseFloat(currentChatFileSizeStr) * 1024 * 1024;
                    } else if (currentChatFileSizeStr.toLowerCase().endsWith('kb')) {
                        currentChatFileBytes = parseFloat(currentChatFileSizeStr) * 1024;
                    } else {
                        const sizeAsNumber = parseFloat(currentChatFileSizeStr);
                        if (!isNaN(sizeAsNumber)) {
                            currentChatFileBytes = sizeAsNumber;
                        } else {
                            console.warn(`Could not parse current chat file size: ${currentChatFileSizeStr}`);
                        }
                    }
                }
                
                const bytes = currentChatFileBytes; // Use the correctly parsed bytes
                const kb = bytes / 1024;
                const mb = kb / 1024;

                if (mb >= 1) {
                    currentChatFileSizeText = `${mb.toFixed(2)} MB`;
                } else if (kb >= 1) {
                    currentChatFileSizeText = `${kb.toFixed(2)} KB`;
                } else {
                    currentChatFileSizeText = `${bytes} B`;
                }
                console.log('DEBUG: currentChatFileSizeText:', currentChatFileSizeText);

                // Parse date from filename (as requested)
                const timeInfo = parseTimeFromFilename(currentChatFile.file_name);
                console.log('DEBUG: timeInfo from filename:', timeInfo);
                if (timeInfo && timeInfo.fullDateTime) {
                    const [datePart, timePart] = timeInfo.fullDateTime.split(' ');
                    const [year, month, day] = datePart.split('-').map(Number);
                    const [hours, minutes, seconds] = timePart.split(':').map(Number);
                    
                    const date = new Date(year, month - 1, day, hours, minutes, seconds);
                    console.log('DEBUG: Parsed date object:', date);
                    
                    if (date && !isNaN(date.getTime())) {
                        currentChatFirstTime = formatDateTime(date);
                        const now = new Date();
                        const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
                        const utcFirstTime = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
                        const diffTime = Math.abs(utcNow - utcFirstTime);
                        currentChatDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                    }
                }
                console.log('DEBUG: currentChatFirstTime:', currentChatFirstTime);
                console.log('DEBUG: currentChatDays:', currentChatDays);

                // Estimate words from file size
                const sizeMatchKB_est = currentChatFile.file_size?.match(/([\d.]+)\s*KB/i);
                let currentChatSizeKB_for_words = 0;
                if (sizeMatchKB_est) {
                    currentChatSizeKB_for_words = parseFloat(sizeMatchKB_est[1]);
                } else {
                    // If size is in MB, convert to KB for estimation
                    const sizeMatchMB_est = currentChatFile.file_size?.match(/([\d.]+)\s*MB/i);
                    if (sizeMatchMB_est) {
                        currentChatSizeKB_for_words = parseFloat(sizeMatchMB_est[1]) * 1024;
                    } else {
                        // If raw bytes, convert to KB
                        const sizeAsNumber = parseFloat(currentChatFile.file_size);
                        if (!isNaN(sizeAsNumber)) {
                            currentChatSizeKB_for_words = sizeAsNumber / 1024;
                        }
                    }
                }
                currentChatWords = Math.round(currentChatSizeKB_for_words * 30); // Using 30 words/KB as a general estimate
                console.log('DEBUG: Estimated currentChatWords:', currentChatWords);
            } else {
                console.log('DEBUG: currentChatFile not found for currentChatId:', currentChatId);
            }
        } catch (error) {
            console.error("Error fetching current chat file info:", error);
        }
    } else {
        console.log('DEBUG: characterId or currentChatId is undefined. characterId:', characterId, 'currentChatId:', currentChatId);
    }

    // Update UI elements for current chat
    $("#ccs-current-start").text(currentChatFirstTime);
    $("#ccs-current-days").text(currentChatDays);
    $("#ccs-current-messages").text(currentChatMessagesCount);
    $("#ccs-current-words").text(currentChatWords);
    $("#ccs-current-total-size").text(currentChatFileSizeText);

    console.log('updateCurrentChatStats: currentChatMessagesCount before calling updateCurrentShareButtonState:', currentChatMessagesCount);
    // Update share button state for current chat
    updateCurrentShareButtonState(currentChatMessagesCount);

    // Update tip visibility for current chat
    const $currentTip = $("#ccs-current-tip");
    if (currentChatMessagesCount <= 2 && currentChatMessagesCount > 0) {
        $currentTip.show();
    } else {
        $currentTip.hide();
    }
  }

  // Debounced function for total stats
  const debouncedUpdateTotalStats = debounce(updateStats, 500);
  // Debounced function for current chat stats
  const debouncedUpdateCurrentChatStats = debounce(updateCurrentChatStats, 500);

  // Initial updates
  debouncedUpdateTotalStats();
  debouncedUpdateCurrentChatStats();

  // Add change listener to checkboxes to update share button state for total stats
  $(document).on('change', '#total-conversation-tab .ccs-share-option input[type="checkbox"]', function() {
      const currentMessageCount = parseInt($("#ccs-messages").text(), 10) || 0; 
      updateShareButtonState(currentMessageCount);
  });

  // Add change listener to checkboxes to update share button state for current stats
  $(document).on('change', '#current-conversation-tab .ccs-share-option input[type="checkbox"]', function() {
      const currentMessageCount = parseInt($("#ccs-current-messages").text(), 10) || 0; 
      updateCurrentShareButtonState(currentMessageCount);
  });

  // Observe character selection changes to trigger auto-refresh for both tabs
  const selectedCharObserver = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
             console.log('Selected character change observed, triggering debounced updates...');
             debouncedUpdateTotalStats();
             debouncedUpdateCurrentChatStats();
             return;
        }
    }
  });

  const selectedCharElement = document.getElementById("rm_button_selected_ch");
  if (selectedCharElement) {
      console.log('Observing #rm_button_selected_ch for mutations.');
      selectedCharObserver.observe(selectedCharElement, {
          childList: true,
          subtree: true,
          characterData: true
      });
  } else {
      console.error('#rm_button_selected_ch element not found for MutationObserver.');
  }

  // Add event listener for the current chat refresh button
  $("#ccs-current-refresh").on("click", async function() {
    const $button = $(this);
    $button.prop('disabled', true).val('更新中...');
    try {
      updateCurrentChatStats();
      $button.val('已更新');
    } catch (error) {
      console.error('更新当前聊天统计失败:', error);
      $button.val('更新失败');
    } finally {
      setTimeout(() => {
        $button.prop('disabled', false).val('刷新');
      }, 800);
    }
  });

  // Tab switching logic
  $(document).on('click', '.tab-button', function() {
    const tabId = $(this).data('tab');

    $('.tab-button').removeClass('active');
    $(this).addClass('active');

    $('.tab-content').removeClass('active');
    $(`#${tabId}-conversation-tab`).addClass('active');

    // Trigger refresh for the newly active tab
    if (tabId === 'total') {
      debouncedUpdateTotalStats();
    } else if (tabId === 'current') {
      debouncedUpdateCurrentChatStats();
    }
  });

  console.log("✅ 聊天陪伴统计插件已加载 (自动刷新已启用)");
});
