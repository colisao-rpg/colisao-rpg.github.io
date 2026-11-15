// =====================================================================
// comum.js — código usado por todas as páginas do site
//   * conexão com o Supabase
//   * exigir login (páginas internas)
//   * barra do topo (nome de quem entrou e botão Sair)
//   * mensagens de erro em português
//   * ajudantes pequenos ($, criar elementos, fotos)
// Precisa ser carregado DEPOIS da biblioteca do Supabase: em cada página,
// primeiro vem o script do supabase-js (cdn.jsdelivr.net) e depois este.
// =====================================================================

// A chave abaixo é a PÚBLICA (publishable). Ela pode ficar na página: o que
// ela consegue fazer é limitado pelas regras (RLS) do banco.
// NUNCA coloque aqui a chave secret/service_role nem a senha do banco.
const SUPABASE_URL = 'https://mhtzbdzutzjappszvfxp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_QFAywoAI_vD1RFYp5M-DBA_1P65FQJF';
const BUCKET = 'fotos-personagens';   // pasta das fotos no Storage
const FOTO_MAX = 20 * 1024 * 1024;    // 20 MB

const sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,        // guarda o login neste aparelho (localStorage)
        autoRefreshToken: true,      // renova sozinho, então o login não expira de uso
        detectSessionInUrl: true
      }
    })
  : null;

// Pede ao navegador para não apagar os dados do site por falta de espaço (melhor esforço)
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

// ---------- ajudantes ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

// Cria um elemento. O texto entra sempre como texto (nunca como HTML),
// então nada que o jogador digitar vira código na página.
function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return e;
}

// Mostra um aviso num elemento (ruim = vermelho, bom = verde)
function aviso(alvo, texto, tipo) {
  const m = typeof alvo === 'string' ? $(alvo) : alvo;
  if (!m) return;
  m.textContent = texto || '';
  m.classList.toggle('ruim', tipo === 'ruim');
  m.classList.toggle('bom', tipo === 'bom');
}

// Iniciais para quando o personagem não tem foto
function iniciais(nome) {
  return (nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
}

const ATRIBUTOS = {
  MOT: 'Motricidade',
  VIG: 'Vigor',
  INT: 'Intelecto'
};

// ---------- mensagens de erro ----------
function erroMsg(e) {
  const m = (e && e.message) || String(e);
  const c = e && e.code;
  // Login
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/already registered|already been registered/i.test(m)) return 'Já existe uma conta com esse e-mail. Use Entrar.';
  if (/Password should be at least/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/valid email|invalid.*email|Unable to validate email/i.test(m)) return 'Esse e-mail não parece válido.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (/Error sending confirmation email|sending.*email/i.test(m)) return 'O Supabase não conseguiu enviar o e-mail de confirmação. Desligue o Confirm email em Authentication ou configure um SMTP.';
  if (/Database error saving new user/i.test(m)) return 'O banco recusou a conta nova. Confira se o gatilho do cadastro está instalado. Detalhe: ' + m;
  if (/signups not allowed/i.test(m)) return 'O cadastro está desligado no painel do Supabase (Authentication).';
  if (/Invalid API key|No API key/i.test(m)) return 'A chave pública do Supabase está errada (comum.js).';
  if (/JWT expired/i.test(m)) return 'Sua sessão expirou. Saia e entre de novo.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Não foi possível falar com o Supabase. Confira a internet.';
  // Banco desatualizado
  if (c === '42703' || c === 'PGRST202' || c === 'PGRST204' || /Could not find the function|column .* does not exist/i.test(m))
    return 'O banco está desatualizado para esta versão do site. Rode o migracao_lobby.sql no SQL Editor do Supabase. Detalhe: ' + m;
  // Regras
  if (c === 'P0001') return m;   // mensagens escritas pelas funções do banco
  if (c === '42501' || /row-level security|permission denied/i.test(m))
    return 'Você não tem permissão para isso. Cada jogador mexe só nas próprias fichas e armas; o mestre mexe nas da campanha dele.';
  if (c === '23514') return 'Algum valor está fora das regras (nível e atributos de 1 a 10, PV até o máximo). Detalhe: ' + m;
  if (c === '23503') return 'Ligação inválida: confira se você participa da campanha e se a arma ainda existe.';
  if (c === '23505') return 'Já existe um registro com esse nome (por exemplo, uma arma com o mesmo nome no mesmo lugar).';
  if (c === '23502') return 'Falta preencher um campo obrigatório. Detalhe: ' + m;
  if (/Bucket not found/i.test(m)) return 'O bucket de fotos não existe. Rode o setup_supabase.sql ou o migracao_foto.sql.';
  return 'Erro: ' + m;
}

// ---------- login obrigatório ----------
// Usado pelas páginas internas (lobby e ficha). Se ninguém entrou, volta
// para a tela de login. Devolve { user, eu }, em que "eu" é a linha da
// tabela jogadores ligada à conta.
async function exigirLogin(alvoAviso) {
  if (!sb) { aviso(alvoAviso, 'Não foi possível carregar a biblioteca do Supabase. Verifique a internet.', 'ruim'); return null; }
  const { data, error } = await sb.auth.getSession();
  const sessao = data && data.session;
  // Sem internet o login continua guardado: avisa em vez de mandar para a tela de entrada
  if (!sessao && error) { aviso(alvoAviso, 'Sem conexão com o servidor. Verifique a internet e recarregue a página.', 'ruim'); return null; }
  if (!sessao) { location.replace('index.html'); return null; }
  const r = await sb.from('jogadores').select('id,nome,email').eq('auth_id', sessao.user.id).maybeSingle();
  if (r.error) { aviso(alvoAviso, erroMsg(r.error), 'ruim'); return null; }
  if (!r.data) { aviso(alvoAviso, 'Sua conta não está ligada a um jogador. Confira se o gatilho do cadastro foi instalado no banco.', 'ruim'); return null; }
  // Se sair em outra aba, esta página também volta para o login
  sb.auth.onAuthStateChange(evento => { if (evento === 'SIGNED_OUT') location.replace('index.html'); });
  return { user: sessao.user, eu: r.data };
}

// Preenche a barra do topo: "nome" e o botão Sair
function montarTopo(ctx) {
  const q = $('#quem');
  if (q) { q.textContent = ''; q.append(el('b', { text: ctx.eu.nome })); }
  const s = $('#sair');
  if (s) s.onclick = async () => { await sb.auth.signOut(); location.replace('index.html'); };
}

// ---------- fotos ----------
function caminhoDaFoto(url) {
  const k = '/object/public/' + BUCKET + '/';
  const i = (url || '').indexOf(k);
  return i < 0 ? null : decodeURIComponent(url.slice(i + k.length).split('?')[0]);
}
// Apaga a foto do Storage, mas só se nenhuma OUTRA ficha usar a mesma foto
async function apagarFotoSeSobrou(url, exceto) {
  const caminho = caminhoDaFoto(url);
  if (!caminho) return;
  try {
    const o = await sb.from('personagens').select('id').eq('foto_url', url);
    const outros = ((o && o.data) || []).filter(x => String(x.id) !== String(exceto));
    if (outros.length) return;
    await sb.storage.from(BUCKET).remove([caminho]);
  } catch (e) { /* se falhar, a foto só fica sobrando no Storage */ }
}


// Janela de confirmação para ações que não têm volta (excluir).
// Passo 1: o botão "Excluir" abre esta janela. Passo 2: só "Confirmar exclusão" apaga.
// Devolve uma Promise: true se confirmou, false se cancelou (botão, Esc ou clique fora).
function confirmarExclusao({ titulo, texto, rotulo = 'Confirmar exclusão' }) {
  return new Promise(resolve => {
    const bCancelar = el('button', { type: 'button', class: 'btn vazado', text: 'Cancelar' });
    const bConfirmar = el('button', { type: 'button', class: 'btn perigo-cheio', text: rotulo });
    const janela = el('dialog', { class: 'confirmar', 'aria-labelledby': 'confTitulo' },
      el('h3', { id: 'confTitulo', text: titulo }),
      el('p', { text: texto }),
      el('div', { class: 'acoes' }, bCancelar, bConfirmar));
    let resposta = false;
    bConfirmar.addEventListener('click', () => { resposta = true; janela.close(); });
    bCancelar.addEventListener('click', () => janela.close());
    janela.addEventListener('click', ev => { if (ev.target === janela) janela.close(); });   // clique fora = cancelar
    janela.addEventListener('close', () => { janela.remove(); resolve(resposta); });
    document.body.append(janela);
    janela.showModal();
    bCancelar.focus();   // o foco começa em Cancelar: Enter sem querer não apaga
  });
}
