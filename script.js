const fetchBtn = document.getElementById('fetch-btn');
const downloadBtn = document.getElementById('download-btn');
const copyBtn = document.getElementById('copy-btn');
const platformSelect = document.getElementById('platform');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const API_BASE_URL = 'https://contest-hive.vercel.app';

function setStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
}

function getEndpoint(platform) {
  if (platform === 'all') {
    return `${API_BASE_URL}/api/all`;
  }
  return `${API_BASE_URL}/api/${platform}`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (hours) {
    parts.push(`${hours} Hour${hours === 1 ? '' : 's'}`);
  }
  if (minutes || !hours) {
    parts.push(`${minutes} Minute${minutes === 1 ? '' : 's'}`);
  }
  return parts.join(' & ');
}

function formatStartTime(utcString) {
  const date = new Date(utcString);
  const options = {
    timeZone: 'Asia/Dhaka',
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.month} ${values.day}, ${values.year} (${values.weekday}) at ${values.hour}:${values.minute} ${values.dayPeriod} BDT`;
}

function normalizeContests(apiData, platformKey) {
  if (!apiData) return [];
  if (Array.isArray(apiData)) {
    return apiData.map((contest) => ({ ...contest, platform: contest.platform || 'Codeforces' }));
  }
  const contests = [];
  Object.entries(apiData).forEach(([key, list]) => {
    if (Array.isArray(list)) {
      list.forEach((contest) => contests.push({ ...contest, platform: contest.platform || key }));
    }
  });
  return contests;
}

function sortContestsByClosest(contests) {
  return contests.slice().sort((a, b) => {
    const aTime = Number(new Date(a.startTime)) || Infinity;
    const bTime = Number(new Date(b.startTime)) || Infinity;
    return aTime - bTime;
  });
}

function isHighPriority(contestStartTime) {
  const contestDate = new Date(contestStartTime);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDay = new Date(today);
  nextDay.setDate(nextDay.getDate() + 2);
  
  const contestDateOnly = new Date(contestDate.getFullYear(), contestDate.getMonth(), contestDate.getDate());
  const tomorrowDateOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  const nextDayDateOnly = new Date(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate());
  
  return contestDateOnly.getTime() === tomorrowDateOnly.getTime() || contestDateOnly.getTime() === nextDayDateOnly.getTime();
}

function getContestText(contest) {
  const title = contest.title || 'Untitled Contest';
  const startTime = formatStartTime(contest.startTime);
  const duration = formatDuration(contest.duration || 0);
  const [datePart, timePart] = startTime.split(' at ');
  return `🔰 **${title}**\n\nStarting Time: **${datePart}** at **${timePart}**\n\nDuration: ${duration}\n\nContest Link: ${contest.url}`;
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

async function copyBlobToClipboard(blob) {
  if (!isClipboardImageSupported()) {
    throw new Error('Clipboard image copy is not supported in this browser.');
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  } catch (error) {
    if (blob.type === 'image/jpeg') {
      try {
        const pngBlob = await new Promise((resolve) => {
          const image = new Image();
          const objectUrl = URL.createObjectURL(blob);
          image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            canvas.toBlob((result) => {
              URL.revokeObjectURL(objectUrl);
              resolve(result);
            }, 'image/png');
          };
          image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
          };
          image.src = objectUrl;
        });
        if (pngBlob) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
          return;
        }
      } catch (pngError) {
        throw new Error('Clipboard does not support image formats (JPEG or PNG).');
      }
    }
    throw error;
  }
}

function getPlatformLogo(platform) {
  if (!platform) return '';
  const key = platform.toLowerCase();
  const logoNameMap = {
    atcoder: 'atcoder',
    codechef: 'codechef',
    codeforces: 'codeforces',
    'codeforces-gym': 'codeforces',
    hackerearth: 'hackerearth',
    hackerrank: 'hackerrank',
    leetcode: 'leetcode',
    toph: 'toph',
  };
  const logoName = logoNameMap[key] || key;
  return `
    <div class="platform-logo">
      <img src="${API_BASE_URL}/assets/svgs/platforms/transparent/${logoName}.svg" alt="${platform} logo" />
    </div>
  `;
}

async function ensureHtml2Canvas() {
  if (window.html2canvas) {
    return window.html2canvas;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = () => {
      if (window.html2canvas) {
        resolve(window.html2canvas);
      } else {
        reject(new Error('html2canvas failed to initialize'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load html2canvas library'));
    document.head.appendChild(script);
  });
}

function createPreviewMarkup(contest) {
  const wrapper = document.createElement('div');
  wrapper.style.width = '220px';
  wrapper.style.height = '165px';
  wrapper.style.padding = '12px';
  wrapper.style.background = '#ffffff';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.justifyContent = 'space-between';
  wrapper.style.borderRadius = '18px';
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.border = '1px solid rgba(148, 163, 184, 0.22)';
  wrapper.style.fontFamily = 'Inter, system-ui, sans-serif';
  wrapper.style.color = '#111827';
  wrapper.style.overflow = 'hidden';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.gap = '10px';

  const logo = document.createElement('img');
  logo.src = `${API_BASE_URL}/assets/svgs/platforms/transparent/${contest.platform.toLowerCase() || 'codeforces'}.svg`;
  logo.alt = `${contest.platform} logo`;
  logo.style.width = '22px';
  logo.style.height = '22px';
  logo.style.objectFit = 'contain';

  const label = document.createElement('div');
  label.style.fontSize = '11px';
  label.style.fontWeight = '700';
  label.style.color = '#475569';
  label.textContent = contest.platform || 'Contest';

  header.appendChild(logo);
  header.appendChild(label);

  const title = document.createElement('div');
  title.style.fontSize = '12px';
  title.style.fontWeight = '700';
  title.style.lineHeight = '1.25';
  title.style.margin = '10px 0 4px';
  title.style.maxHeight = '36px';
  title.style.overflow = 'hidden';
  title.style.textOverflow = 'ellipsis';
  title.style.display = '-webkit-box';
  title.style.WebkitLineClamp = '2';
  title.style.WebkitBoxOrient = 'vertical';
  title.textContent = contest.title || 'Untitled Contest';

  const info = document.createElement('div');
  info.style.fontSize = '10px';
  info.style.lineHeight = '1.4';
  info.style.color = '#334155';
  info.style.display = 'grid';
  info.style.gap = '3px';
  const startTime = formatStartTime(contest.startTime);
  const [datePart, timePart] = startTime.split(' at ');
  info.innerHTML = `
    <div><strong>Start:</strong> ${datePart}</div>
    <div><strong>Time:</strong> ${timePart}</div>
    <div><strong>Duration:</strong> ${formatDuration(contest.duration || 0)}</div>
  `;

  const link = document.createElement('div');
  link.style.fontSize = '9px';
  link.style.color = '#2563eb';
  link.style.wordBreak = 'break-all';
  link.style.marginTop = '6px';
  link.textContent = contest.url;

  wrapper.appendChild(header);
  wrapper.appendChild(title);
  wrapper.appendChild(info);
  wrapper.appendChild(link);

  return wrapper;
}

async function generateCardPreview(card, contest) {
  const previewImg = card.querySelector('.preview-image');
  const previewStatus = card.querySelector('.preview-status');
  const downloadBtn = card.querySelector('.card-download-btn');
  const copyImageBtn = card.querySelector('.card-copyimg-btn');

  let previewWrapper;
  try {
    const html2canvas = await ensureHtml2Canvas();
    const previewMarkup = createPreviewMarkup(contest);
    previewWrapper = document.createElement('div');
    previewWrapper.style.position = 'absolute';
    previewWrapper.style.top = '-9999px';
    previewWrapper.style.left = '-9999px';
    previewWrapper.style.width = '220px';
    previewWrapper.style.height = '165px';
    previewWrapper.style.padding = '0';
    previewWrapper.style.background = 'transparent';
    previewWrapper.style.overflow = 'hidden';
    previewWrapper.style.borderRadius = '18px';
    previewWrapper.appendChild(previewMarkup);
    document.body.appendChild(previewWrapper);

    const canvas = await html2canvas(previewWrapper, {
      backgroundColor: null,
      width: 220,
      height: 165,
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    previewImg.src = dataUrl;
    previewImg.alt = `${contest.title} preview`;
    previewImg.classList.add('loaded');
    previewImg.previewBlob = blob;
    previewStatus.textContent = '';

    downloadBtn.disabled = false;
    downloadBtn.onclick = () => {
      const link = document.createElement('a');
      link.href = dataUrl;
      const safeTitle = contest.title ? contest.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'contest';
      link.download = `${safeTitle}.jpg`;
      link.click();
    };

    if (copyImageBtn) {
      if (isMobile()) {
        copyImageBtn.disabled = false;
        copyImageBtn.textContent = 'Download';
        copyImageBtn.onclick = downloadBtn.onclick;
      } else {
        copyImageBtn.disabled = !isClipboardImageSupported();
        copyImageBtn.onclick = async () => {
          try {
            if (!previewImg.previewBlob) {
              throw new Error('No generated image available yet.');
            }
            await copyBlobToClipboard(previewImg.previewBlob);
            setStatus(`Copied image for ${contest.title}.`, 'success');
          } catch (error) {
            setStatus('Unable to copy image: ' + error.message, 'error');
          }
        };
      }
    }
  } catch (error) {
    previewStatus.textContent = 'Preview unavailable';
    downloadBtn.disabled = true;
    if (copyImageBtn) copyImageBtn.disabled = true;
  } finally {
    if (previewWrapper && previewWrapper.parentNode) {
      previewWrapper.parentNode.removeChild(previewWrapper);
    }
  }
}

function renderContests(contests) {
  resultsEl.innerHTML = '';
  if (!contests.length) {
    resultsEl.innerHTML = '<p>No upcoming contests found.</p>';
    downloadBtn.disabled = true;
    copyBtn.disabled = true;
    return;
  }

  const textLines = [];
  contests.forEach((contest) => {
    const platformName = contest.platform || 'Contest';
    const title = contest.title || 'Untitled Contest';
    const startTime = formatStartTime(contest.startTime);
    const duration = formatDuration(contest.duration || 0);
    const card = document.createElement('article');
    card.className = 'contest-card';
    if (isHighPriority(contest.startTime)) {
      card.classList.add('high-priority');
    }
    card.innerHTML = `
      <div class="contest-capture">
        ${isHighPriority(contest.startTime) ? '<div class="priority-badge">⚡ High Priority</div>' : ''}
        <div class="contest-brand">
          ${getPlatformLogo(contest.platform)}
          <h3 class="brand-name">${platformName}</h3>
        </div>
        <h2 class="card-title">🔰 ${title}</h2>
        <p class="card-meta"><strong>Starting Time:</strong> ${startTime}</p>
        <p class="card-meta"><strong>Duration:</strong> ${duration}</p>
        <p class="card-link"><strong>Contest Link:</strong> <a href="${contest.url}" target="_blank" rel="noopener noreferrer">${contest.url}</a></p>
      </div>
      <div class="contest-actions">
        <button type="button" class="card-action card-copy-btn">Copy</button>
        <button type="button" class="card-action card-copyimg-btn" disabled>Copy Img</button>
        <button type="button" class="card-action card-download-btn" disabled>Download JPG</button>
      </div>
      <div class="contest-preview">
        <img class="preview-image" src="" alt="Preview will appear here" />
        <p class="preview-status">Generating preview...</p>
      </div>
    `;

    resultsEl.appendChild(card);

    const cardCopyBtn = card.querySelector('.card-copy-btn');
    cardCopyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(getContestText(contest));
        setStatus(`Copied contest text for ${title}.`, 'success');
      } catch (error) {
        setStatus('Unable to copy contest text: ' + error.message, 'error');
      }
    });

    generateCardPreview(card, contest);

    const [datePart, timePart] = startTime.split(' at ');
    textLines.push(`🔰 **${title}**`);
    textLines.push('');
    textLines.push(`Starting Time: **${datePart}** at **${timePart}**`);
    textLines.push('');
    textLines.push(`Duration: ${duration}`);
    textLines.push('');
    textLines.push(`Contest Link: ${contest.url}`);
    textLines.push('');
    textLines.push('');
  });

  const pre = document.createElement('pre');
  pre.className = 'preformatted';
  pre.textContent = textLines.join('\n');
  resultsEl.appendChild(pre);

  downloadBtn.disabled = false;
  copyBtn.disabled = false;
}

async function fetchContests() {
  const platform = platformSelect.value;
  const endpoint = getEndpoint(platform);
  setStatus('Loading contests from ' + endpoint + '...', 'info');
  downloadBtn.disabled = true;
  copyBtn.disabled = true;
  resultsEl.innerHTML = '';

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = await response.json();
    if (!json.ok) {
      throw new Error('API returned ok=false');
    }

    const contests = sortContestsByClosest(normalizeContests(json.data));
    renderContests(contests);
    setStatus(`${contests.length} contest${contests.length === 1 ? '' : 's'} loaded successfully.`, 'success');
  } catch (error) {
    setStatus('Failed to load contests: ' + error.message, 'error');
    resultsEl.innerHTML = '';
    downloadBtn.disabled = true;
    copyBtn.disabled = true;
  }
}

async function downloadJpg() {
  const previewImages = Array.from(resultsEl.querySelectorAll('.preview-image'));
  const validImages = previewImages.filter((img) => img.src && img.classList.contains('loaded'));
  if (!validImages.length) {
    setStatus('No generated previews are available for download yet.', 'error');
    return;
  }

  validImages.forEach((img, index) => {
    const link = document.createElement('a');
    link.href = img.src;
    link.download = `contest-card-${index + 1}.jpg`;
    link.click();
  });
  setStatus('Downloaded JPG previews for available contests.', 'success');
}

async function copyText() {
  const pre = resultsEl.querySelector('.preformatted');
  if (!pre) return;
  try {
    await navigator.clipboard.writeText(pre.textContent);
    setStatus('Contest text copied to clipboard.', 'success');
  } catch (error) {
    setStatus('Failed to copy text: ' + error.message, 'error');
  }
}

fetchBtn.addEventListener('click', fetchContests);
downloadBtn.addEventListener('click', downloadJpg);
copyBtn.addEventListener('click', copyText);

document.addEventListener('DOMContentLoaded', () => {
  fetchContests();
});
