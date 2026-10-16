// ============================================================
// version.js — consulta de versão/commit via GitHub API e rodapé
// ============================================================

const CACHE_KEY = 'lca2_version_cache_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutos de cache

const REPO_OWNER = 'celiobenj';
const REPO_NAME  = 'motor-control-lca2';
const REPO_URL   = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

/**
 * Inicializa as informações do rodapé:
 * 1. Atualiza o ano de copyright dinamicamente.
 * 2. Consulta a API do GitHub (ou cache) para obter a tag de release e/ou hash do commit da main.
 */
export async function initVersionFooter() {
  const elVersion = document.getElementById('footer-version');
  if (!elVersion) return;

  // 2. Tenta recuperar do cache local do navegador
  try {
    const cachedStr = sessionStorage.getItem(CACHE_KEY);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      if (Date.now() - cached.timestamp < CACHE_TTL_MS && cached.data) {
        _renderVersion(elVersion, cached.data);
        return;
      }
    }
  } catch (_) {
    // sessionStorage indisponível ou corrompido
  }

  // 3. Consulta a API do GitHub
  let releaseTag = null;
  let releaseUrl = null;
  let commitSha  = null;
  let commitUrl  = null;

  try {
    // Busca última release / tag
    const resRel = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
    if (resRel.ok) {
      const relData = await resRel.json();
      if (relData.tag_name) {
        releaseTag = relData.tag_name;
        releaseUrl = relData.html_url || `${REPO_URL}/releases/tag/${releaseTag}`;
      }
    }
  } catch (_) {}

  try {
    // Busca commit mais recente da branch main
    const resCommit = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/main`);
    if (resCommit.ok) {
      const commitData = await resCommit.json();
      if (commitData.sha) {
        commitSha = commitData.sha.substring(0, 7);
        commitUrl = commitData.html_url || `${REPO_URL}/commit/${commitData.sha}`;
      }
    }
  } catch (_) {}

  // 4. Monta o rótulo e o link
  let label = '';
  let url   = REPO_URL;

  if (releaseTag && commitSha) {
    label = `${releaseTag} (${commitSha})`;
    url   = releaseUrl || commitUrl;
  } else if (releaseTag) {
    label = releaseTag;
    url   = releaseUrl;
  } else if (commitSha) {
    label = `main (${commitSha})`;
    url   = commitUrl || `${REPO_URL}/tree/main`;
  } else {
    label = 'main';
    url   = `${REPO_URL}/tree/main`;
  }

  const versionData = { label, url };

  // 5. Salva no cache
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      data: versionData,
      timestamp: Date.now(),
    }));
  } catch (_) {}

  // 6. Renderiza no DOM
  _renderVersion(elVersion, versionData);
}

function _renderVersion(container, { label, url }) {
  container.innerHTML = '';
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.className = 'footer-link';
  a.textContent = label;
  container.appendChild(a);
}
