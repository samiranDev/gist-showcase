
// Replace with your GitHub OAuth App's Client ID
const CLIENT_ID = 'a86b9ad9d7b2c16cee0d24fbfae0909377351bc5'; // Register at https://github.com/settings/developers
const REDIRECT_URI = 'https://samirandev.github.io/gist-showcase';

let accessToken = localStorage.getItem('github_access_token') || null;
let currentUser = localStorage.getItem('github_username') || null;
let allGists = [];
let activeCategory = 'All';
let markInstance = new Mark(document.getElementById('gistContainer'));
let modalMarkInstance = null;
let currentMatchIndex = -1;
let matches = [];
let modalMatches = [];
let modalCurrentMatchIndex = -1;
let isWrapped = false;
let modalSearchTimeout = null;
let isCategoryExpanded = false;

// Check for GitHub OAuth callback
window.onload = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (code) {
    exchangeCodeForToken(code);
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    initializeApp();
  }
  document.getElementById('year').textContent = new Date().getFullYear();
};

function initializeApp() {
  updateUIForAuth();
  loadRecentSearches();
  if (accessToken && currentUser) {
    loadUserGists();
  }
}

function signInWithGitHub() {
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=gist`;
  window.location.href = authUrl;
}

async function exchangeCodeForToken(code) {
  try {
    // Note: In a production app, this should be handled by a backend server for security
    // This is a simplified client-side example
    const response = await fetch('https://cors-anywhere.herokuapp.com/https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: 'YOUR_GITHUB_CLIENT_SECRET', // Add your client secret (keep secure)
        code: code,
        redirect_uri: REDIRECT_URI
      })
    });
    const data = await response.json();
    if (data.access_token) {
      accessToken = data.access_token;
      localStorage.setItem('github_access_token', accessToken);
      await fetchUserInfo();
      updateUIForAuth();
      loadUserGists();
    } else {
      showModernAlert('GitHub authentication failed. Please try again.');
    }
  } catch (err) {
    console.error('Token exchange error:', err);
    showModernAlert('An error occurred during authentication. Please try again.');
  }
}

async function fetchUserInfo() {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!response.ok) throw new Error('Failed to fetch user info');
    const user = await response.json();
    currentUser = user.login;
    localStorage.setItem('github_username', currentUser);
  } catch (err) {
    console.error('Fetch user error:', err);
    showModernAlert('Failed to fetch user information. Please try again.');
    signOut();
  }
}

function signOut() {
  accessToken = null;
  currentUser = null;
  localStorage.removeItem('github_access_token');
  localStorage.removeItem('github_username');
  updateUIForAuth();
  document.getElementById('gistContainer').innerHTML = '';
  document.getElementById('categoryButtons').innerHTML = '';
  document.getElementById('navSearchBtn').style.display = 'none';
  closeSearchBar();
}

function updateUIForAuth() {
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const usernameSearch = document.getElementById('usernameSearch');
  const recentSearches = document.getElementById('recentSearches');

  if (accessToken && currentUser) {
    signInBtn.style.display = 'none';
    signOutBtn.style.display = 'inline-block';
    usernameSearch.style.display = 'none';
    recentSearches.style.display = 'none';
  } else {
    signInBtn.style.display = 'inline-block';
    signOutBtn.style.display = 'none';
    usernameSearch.style.display = 'flex';
    recentSearches.style.display = 'flex';
  }
}

function loadRecentSearches() {
  if (accessToken && currentUser) return;
  const recentSearches = JSON.parse(localStorage.getItem('recentSearches')) || [];
  const recentSearchesContainer = document.getElementById('recentSearches');
  recentSearchesContainer.innerHTML = '';

  recentSearches.forEach(username => {
    const span = document.createElement('span');
    span.innerHTML = `${sanitizeHtml(username)} <i class="fas fa-times delete-btn" onclick="deleteSearch('${sanitizeHtml(username)}')"></i>`;
    span.onclick = (e) => {
      if (e.target.classList.contains('delete-btn')) return;
      loadGistsByUsername(username);
    };
    recentSearchesContainer.appendChild(span);
  });
}

function saveRecentSearches(username) {
  if (accessToken && currentUser) return;
  const recentSearches = JSON.parse(localStorage.getItem('recentSearches')) || [];
  if (!recentSearches.includes(username)) {
    recentSearches.unshift(username);
    if (recentSearches.length > 5) {
      recentSearches.pop();
    }
    localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
  }
  loadRecentSearches();
}

function deleteSearch(username) {
  let recentSearches = JSON.parse(localStorage.getItem('recentSearches')) || [];
  recentSearches = recentSearches.filter(item => item !== username);
  localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
  loadRecentSearches();
}

function loadGistsByUsername(username) {
  document.getElementById('username').value = username;
  loadGists();
}

function showModernAlert(message) {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'modern-alert';
  alertDiv.innerHTML = `
    <h4>Oops!</h4>
    <p>${message}</p>
    <button class="btn-dismiss" onclick="this.parentElement.classList.add('exiting'); setTimeout(() => this.parentElement.remove(), 300)">Dismiss</button>
  `;
  document.body.appendChild(alertDiv);

  setTimeout(() => {
    if (alertDiv.parentElement) {
      alertDiv.classList.add('exiting');
      setTimeout(() => alertDiv.remove(), 300);
    }
  }, 5000);
}

async function loadGists() {
  if (accessToken && currentUser) {
    loadUserGists();
    return;
  }

  const username = document.getElementById('username').value.trim();
  if (!username) {
    showModernAlert('Please enter a GitHub username.');
    document.getElementById('navSearchBtn').style.display = 'none';
    closeSearchBar();
    return;
  }

  const container = document.getElementById('gistContainer');
  container.innerHTML = '';

  for (let i = 0; i < 6; i++) {
    const skel = document.createElement('div');
    skel.className = 'col-12 col-md-6 col-lg-4';
    skel.innerHTML = '<div class="skeleton w-100"></div>';
    container.appendChild(skel);
  }

  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/gists`);
    if (res.status === 404) {
      container.innerHTML = '';
      showModernAlert('Invalid username! Please check and try again.');
      document.getElementById('navSearchBtn').style.display = 'none';
      closeSearchBar();
      return;
    }
    if (!res.ok) {
      container.innerHTML = '';
      showModernAlert('Failed to fetch Gists. Please try again later.');
      document.getElementById('navSearchBtn').style.display = 'none';
      closeSearchBar();
      return;
    }
    const data = await res.json();
    container.innerHTML = '';
    allGists = data;
    if (data.length === 0) {
      showModernAlert('No Gists Found! This user has no public gists.');
      document.getElementById('navSearchBtn').style.display = 'none';
      closeSearchBar();
    } else {
      document.getElementById('navSearchBtn').style.display = 'inline-block';
      saveRecentSearches(username);
    }
    displayCategories();
    displayGists('All');
  } catch (err) {
    container.innerHTML = '';
    showModernAlert('An unexpected error occurred. Please try again.');
    document.getElementById('navSearchBtn').style.display = 'none';
    closeSearchBar();
    console.error('Error:', err);
  }
}

async function loadUserGists() {
  if (!accessToken || !currentUser) return;

  const container = document.getElementById('gistContainer');
  container.innerHTML = '';

  for (let i = 0; i < 6; i++) {
    const skel = document.createElement('div');
    skel.className = 'col-12 col-md-6 col-lg-4';
    skel.innerHTML = '<div class="skeleton w-100"></div>';
    container.appendChild(skel);
  }

  try {
    const res = await fetch('https://api.github.com/gists', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!res.ok) {
      container.innerHTML = '';
      showModernAlert('Failed to fetch your Gists. Please try signing in again.');
      document.getElementById('navSearchBtn').style.display = 'none';
      closeSearchBar();
      return;
    }
    const data = await res.json();
    container.innerHTML = '';
    allGists = data;
    if (data.length === 0) {
      showModernAlert('No Gists Found! You have no public or private Gists.');
      document.getElementById('navSearchBtn').style.display = 'none';
      closeSearchBar();
    } else {
      document.getElementById('navSearchBtn').style.display = 'inline-block';
    }
    displayCategories();
    displayGists('All');
  } catch (err) {
    container.innerHTML = '';
    showModernAlert('An unexpected error occurred. Please try again.');
    document.getElementById('navSearchBtn').style.display = 'none';
    closeSearchBar();
    console.error('Error:', err);
  }
}

function getCategories() {
  const extSet = new Set();
  allGists.forEach(gist => {
    for (const file in gist.files) {
      const ext = gist.files[file].filename.split('.').pop() || 'txt';
      extSet.add(ext);
    }
  });
  return ['All', ...Array.from(extSet)];
}

function displayCategories() {
  const container = document.getElementById('categoryButtons');
  const toggleContainer = document.getElementById('categoryToggle');
  const viewMoreBtn = document.getElementById('viewMoreBtn');
  const viewLessBtn = document.getElementById('viewLessBtn');
  container.innerHTML = '';
  const categories = getCategories();

  categories.forEach((cat, index) => {
    const btn = document.createElement('button');
    btn.textContent = cat.toUpperCase();
    btn.className = `btn ${cat === activeCategory ? 'btn-success' : 'btn-secondary'}`;
    btn.setAttribute('data-category', cat);
    if (index >= 5 && !isCategoryExpanded) {
      btn.style.display = 'none';
      btn.classList.add('hidden-category');
    } else {
      btn.style.display = 'inline-flex';
      btn.classList.remove('hidden-category');
    }
    btn.onclick = () => {
      activeCategory = cat;
      displayGists(cat);
      container.querySelectorAll('.btn').forEach(b => {
        b.className = `btn ${b.getAttribute('data-category') === activeCategory ? 'btn-success' : 'btn-secondary'}`;
      });
    };
    container.appendChild(btn);
  });

  if (categories.length > 5) {
    viewMoreBtn.style.display = isCategoryExpanded ? 'none' : 'block';
    viewLessBtn.style.display = isCategoryExpanded ? 'block' : 'none';

    viewMoreBtn.onclick = () => {
      isCategoryExpanded = true;
      container.querySelectorAll('.hidden-category').forEach(btn => {
        btn.style.display = 'inline-flex';
        btn.classList.remove('hidden-category');
      });
      viewMoreBtn.style.display = 'none';
      viewLessBtn.style.display = 'block';
    };

    viewLessBtn.onclick = () => {
      isCategoryExpanded = false;
      container.querySelectorAll('.btn').forEach((btn, index) => {
        if (index >= 5) {
          btn.style.display = 'none';
          btn.classList.add('hidden-category');
        }
      });
      viewMoreBtn.style.display = 'block';
      viewLessBtn.style.display = 'none';
    };
  } else {
    toggleContainer.style.display = 'none';
  }
}

async function displayGists(category) {
  const container = document.getElementById('gistContainer');
  container.innerHTML = '';

  for (const gist of allGists) {
    const gistDate = new Date(gist.created_at).toLocaleDateString();
    for (const fileName in gist.files) {
      const file = gist.files[fileName];
      const ext = file.filename.split('.').pop() || 'txt';

      if (category !== 'All' && ext !== category) continue;

      try {
        const res = await fetch(file.raw_url, {
          headers: accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}
        });
        if (!res.ok) throw new Error('Failed to fetch file content');
        const code = await res.text();

        const card = document.createElement('div');
        card.className = 'col-12 col-md-6 col-lg-4';

        card.innerHTML = `
          <div class="card text-white h-100 d-flex flex-column justify-content-between">
            <div class="card-body">
              <h5 class="card-title">${sanitizeHtml(file.filename)}</h5>
              <h6 class="card-subtitle mb-2 text-success">${sanitizeHtml(gist.description || 'No description')}</h6>
              <p class="card-text"><small>Created: ${gistDate}</small></p>
              <pre><code class="language-${file.language?.toLowerCase() || 'text'}">${sanitizeHtml(code)}</code></pre>
            </div>
            <div class="card-footer text-center">
              <button class="btn btn-success view-btn" data-lang="${file.language || 'text'}" data-filename="${sanitizeHtml(file.filename)}" data-code="${encodeURIComponent(code)}">View Code</button>
            </div>
          </div>
        `;

        container.appendChild(card);
        hljs.highlightAll();

        const viewBtn = card.querySelector('.view-btn');
        viewBtn.addEventListener('click', () => {
          const decoded = decodeURIComponent(viewBtn.dataset.code);
          const lang = viewBtn.dataset.lang;
          const filename = viewBtn.dataset.filename;
          showModal(decoded, lang, filename);
        });
      } catch (err) {
        console.error(`Error fetching ${file.filename}:`, err);
        const errorCard = document.createElement('div');
        errorCard.className = 'col-12 col-md-6 col-lg-4';
        errorCard.innerHTML = `
          <div class="card text-white h-100">
            <div class="card-body">
              <h5 class="card-title">${sanitizeHtml(file.filename)}</h5>
              <p class="text-danger">Failed to load content.</p>
            </div>
          </div>
        `;
        container.appendChild(errorCard);
      }
    }
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput.value.trim()) {
    setTimeout(() => performSearch(searchInput.value), 0);
  }
}

function showModal(code, language, filename) {
  const modalTitle = document.getElementById('codeModalLabel');
  modalTitle.textContent = `Code: ${sanitizeHtml(filename)}`;

  const modalCode = document.getElementById('modalCode');
  modalCode.className = `language-${language?.toLowerCase() || 'text'}`;
  modalCode.textContent = code;
  hljs.highlightBlock(modalCode);

  const modalPre = document.getElementById('modalPre');
  modalPre.classList.toggle('wrap', isWrapped);

  modalMarkInstance = new Mark(modalCode);

  const copyBtn = document.querySelector('.copy-modal-btn');
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(code).then(() => {
      const feedback = copyBtn.querySelector('.copy-feedback');
      feedback.classList.add('show');
      setTimeout(() => feedback.classList.remove('show'), 2000);
    }).catch(() => {
      showModernAlert('Failed to copy code.');
    });
  };

  const downloadBtn = document.querySelector('.download-modal-btn');
  downloadBtn.onclick = () => {
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizedFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const wrapBtn = document.querySelector('.wrap-modal-btn');
  wrapBtn.innerHTML = `<i class="fas fa-align-${isWrapped ? 'justify' : 'left'}"></i> ${isWrapped ? 'Unwrap' : 'Wrap'}`;
  wrapBtn.onclick = () => {
    isWrapped = !isWrapped;
    modalPre.classList.toggle('wrap', isWrapped);
    wrapBtn.innerHTML = `<i class="fas fa-align-${isWrapped ? 'justify' : 'left'}"></i> ${isWrapped ? 'Unwrap' : 'Wrap'}`;
  };

  const modalSearchInput = document.getElementById('modalSearchInput');
  modalSearchInput.value = '';
  modalMatches = [];
  modalCurrentMatchIndex = -1;

  modalSearchInput.oninput = () => {
    clearTimeout(modalSearchTimeout);
    modalSearchTimeout = setTimeout(() => {
      performModalSearch(modalSearchInput.value);
    }, 300);
  };

  modalSearchInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      navigateModalSearch('next');
    }
  };

  const modalEl = document.getElementById('codeModal');
  modalEl.addEventListener('hidden.bs.modal', () => {
    modalSearchInput.value = '';
    modalMarkInstance.unmark();
    modalMatches = [];
    modalCurrentMatchIndex = -1;
  }, { once: true });

  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  // Adjust modal code font size based on viewport
  modalCode.style.fontSize = `clamp(0.65rem, 2.5vw, ${window.innerWidth <= 576 ? '0.75rem' : window.innerWidth <= 768 ? '0.8rem' : '0.85rem'})`;
}

function performModalSearch(query) {
  try {
    modalMarkInstance.unmark({
      done: () => {
        modalMatches = [];
        modalCurrentMatchIndex = -1;
        if (query.trim()) {
          modalMarkInstance.mark(query, {
            element: 'mark',
            className: '',
            caseSensitive: false,
            separateWordSearch: false,
            acrossElements: true,
            each: (element) => {
              modalMatches.push(element);
            },
            done: (count) => {
              console.log(`Found ${count} matches in modal for query: ${query}`);
              if (modalMatches.length > 0) {
                modalCurrentMatchIndex = 0;
                highlightModalMatch(modalCurrentMatchIndex);
              }
            },
            noMatch: () => {
              console.log(`No matches found in modal for query: ${query}`);
            }
          });
        }
      }
    });
  } catch (e) {
    console.error('Modal search error:', e);
    showModernAlert('Search in code failed. Please try again.');
  }
}

function highlightModalMatch(index) {
  modalMatches.forEach((match, i) => {
    match.classList.toggle('active', i === index);
  });
  if (modalMatches[index]) {
    modalMatches[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function navigateModalSearch(direction) {
  if (modalMatches.length === 0) return;
  if (direction === 'next') {
    modalCurrentMatchIndex = (modalCurrentMatchIndex + 1) % modalMatches.length;
  } else {
    modalCurrentMatchIndex = (modalCurrentMatchIndex - 1 + modalMatches.length) % modalMatches.length;
  }
  highlightModalMatch(modalCurrentMatchIndex);
}

function sanitizeHtml(str) {
  return str.replace(/[&<>"'`=\/]/g, function(s) {
    return `&#${s.charCodeAt(0)};`;
  });
}

function toggleSearchBar() {
  const searchBar = document.getElementById('searchBar');
  const searchInput = document.getElementById('searchInput');
  if (searchBar.classList.contains('active')) {
    closeSearchBar();
  } else {
    searchBar.classList.add('active');
    searchInput.focus();
  }
}

function closeSearchBar() {
  const searchBar = document.getElementById('searchBar');
  const searchInput = document.getElementById('searchInput');
  searchBar.classList.remove('active');
  searchInput.value = '';
  markInstance.unmark();
  currentMatchIndex = -1;
  matches = [];
}

function performSearch(query) {
  try {
    markInstance.unmark({
      done: () => {
        matches = [];
        currentMatchIndex = -1;
        if (query.trim()) {
          markInstance.mark(query, {
            element: 'mark',
            className: '',
            caseSensitive: false,
            separateWordSearch: false,
            acrossElements: true,
            exclude: ['pre', 'code'],
            filter: (textNode, term, marksSoFar, markData) => {
              const parent = textNode.parentElement;
              return parent.closest('.card-title') || parent.closest('.card-subtitle');
            },
            each: (element) => {
              matches.push(element);
            },
            done: (count) => {
              console.log(`Found ${count} matches for query: ${query}`);
              if (matches.length > 0) {
                currentMatchIndex = 0;
                highlightMatch(currentMatchIndex);
              }
            },
            noMatch: () => {
              console.log(`No matches found for query: ${query}`);
            }
          });
        }
      }
    });
  } catch (e) {
    console.error('Search error:', e);
    showModernAlert('Search failed. Please try again.');
  }
}

function highlightMatch(index) {
  matches.forEach((match, i) => {
    match.classList.toggle('active', i === index);
  });
  if (matches[index]) {
    matches[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function navigateSearch(direction) {
  if (matches.length === 0) return;
  if (direction === 'next') {
    currentMatchIndex = (currentMatchIndex + 1) % matches.length;
  } else {
    currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
  }
  highlightMatch(currentMatchIndex);
}

const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', (e) => {
  performSearch(e.target.value);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    navigateSearch('next');
  }
});
