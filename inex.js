const API_BASE = 'http://localhost:3000';

/* ---------------------------------------------------------
   ESTADO GLOBAL
--------------------------------------------------------- */
const state = {
  veiculos: [],
  clientes: [],
  locacoes: [],
  manutencoes: [],
  catalogo: { lista: [], categoriaAtiva: 'Todos', centerIndex: 0 }
};

// Variáveis para instâncias dos gráficos
let chartEvolucaoInstance = null;
let chartTopCarrosInstance = null;
let chartTopClientesInstance = null;

/* ---------------------------------------------------------
   TOASTS / ALERTAS (SweetAlert2)
--------------------------------------------------------- */
const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (el) => {
    el.onmouseenter = Swal.stopTimer;
    el.onmouseleave = Swal.resumeTimer;
  }
});

function toastSuccess(msg) { Toast.fire({ icon: 'success', title: msg }); }
function toastError(msg) { Toast.fire({ icon: 'error', title: msg }); }
function toastWarn(msg) { Toast.fire({ icon: 'warning', title: msg }); }
function toastInfo(msg) { Toast.fire({ icon: 'info', title: msg }); }

function confirmAction({ title, text, icon = 'warning', confirmText = 'Confirmar', danger = false }) {
  return Swal.fire({
    title, text, icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancelar',
    confirmButtonColor: danger ? '#E5484D' : '#2F6FED',
    cancelButtonColor: '#94A0B4',
    reverseButtons: true,
    focusCancel: true
  }).then(r => r.isConfirmed);
}

function alertError(title, text) {
  return Swal.fire({ icon: 'error', title, text, confirmButtonColor: '#2F6FED' });
}

/* ---------------------------------------------------------
   HELPERS DE FORMATAÇÃO
--------------------------------------------------------- */
const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function formatCurrency(v) { return currencyFmt.format(Number(v) || 0); }

function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function diffDays(startISO, endISO) {
  const start = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  return Math.round((end - start) / 86400000);
}

function isBeforeToday(iso) { return iso < todayISO(); }

function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/* ---------------------------------------------------------
   MÁSCARAS DE INPUT
--------------------------------------------------------- */
function maskPlaca(value) {
  let v = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  if (v.length <= 3) return v;
  const letras = v.slice(0, 3);
  const resto = v.slice(3);
  const isMercosul = resto.length >= 2 && /[A-Z]/.test(resto[1]);
  return isMercosul ? letras + resto : letras + '-' + resto;
}
function normPlaca(v) { return (v || '').replace(/[^A-Z0-9]/gi, '').toUpperCase(); }

function maskAno(value) { return value.replace(/\D/g, '').slice(0, 4); }

function maskCPF(value) {
  let v = value.replace(/\D/g, '').slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return v;
}
function normDigits(v) { return (v || '').replace(/\D/g, ''); }

function maskTelefone(value) {
  let v = value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) {
    v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  } else if (v.length > 5) {
    v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  } else if (v.length > 2) {
    v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
  } else if (v.length > 0) {
    v = v.replace(/(\d{0,2})/, '($1');
  }
  return v.trim();
}

function maskCEP(value) {
  let v = value.replace(/\D/g, '').slice(0, 8);
  v = v.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
  return v;
}

/* ---------------------------------------------------------
   VALIDADORES
--------------------------------------------------------- */
function validarCPF(cpfRaw) {
  const cpf = normDigits(cpfRaw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[10])) return false;
  return true;
}

function validarEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

function idadeAnos(dataNascISO) {
  const nasc = new Date(dataNascISO + 'T00:00:00');
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function statusCNH(validadeISO) {
  const hoje = todayISO();
  const dias = diffDays(hoje, validadeISO);
  if (dias < 0) return 'vencida';
  if (dias <= 30) return 'proxima';
  return 'ok';
}

/* ---------------------------------------------------------
   CAMADA DE API (fetch real contra o JSON Server)
--------------------------------------------------------- */
async function apiGet(resource) {
  const res = await fetch(`${API_BASE}/${resource}`);
  if (!res.ok) throw new Error(`Falha ao buscar ${resource}`);
  return res.json();
}
async function apiPost(resource, data) {
  const res = await fetch(`${API_BASE}/${resource}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Falha ao criar em ${resource}`);
  return res.json();
}
async function apiPut(resource, id, data) {
  const res = await fetch(`${API_BASE}/${resource}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Falha ao atualizar em ${resource}`);
  return res.json();
}
async function apiPatch(resource, id, data) {
  const res = await fetch(`${API_BASE}/${resource}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Falha ao atualizar em ${resource}`);
  return res.json();
}
async function apiDelete(resource, id) {
  const res = await fetch(`${API_BASE}/${resource}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Falha ao excluir em ${resource}`);
  return true;
}

async function carregarTudo() {
  try {
    const [veiculos, clientes, locacoes, manutencoes] = await Promise.all([
      apiGet('veiculos'), apiGet('clientes'), apiGet('locacoes'), apiGet('manutencoes')
    ]);
    state.veiculos = veiculos;
    state.clientes = clientes;
    state.locacoes = locacoes;
    state.manutencoes = manutencoes;
    await sincronizarAtrasos();
    renderTudo();
  } catch (err) {
    console.error(err);
    alertError(
      'Não foi possível conectar à API',
      'Verifique se o JSON Server está rodando em http://localhost:3000 (json-server --watch db.json --port 3000).'
    );
  }
}

async function sincronizarAtrasos() {
  const hoje = todayISO();
  for (const loc of state.locacoes) {
    if (loc.status === 'Em Andamento' && loc.dataRetornoPrevista < hoje) {
      loc.status = 'Atrasada';
      try { await apiPatch('locacoes', loc.id, { status: 'Atrasada' }); } catch (e) { /* silencioso */ }
    }
  }
}

function renderTudo() {
  renderDashboard();
  renderCatalogo();
  renderVeiculos();
  renderClientes();
  renderLocacoes();
  renderManutencoes();
}

/* ---------------------------------------------------------
   LOOKUPS
--------------------------------------------------------- */
function getVeiculo(id) { return state.veiculos.find(v => v.id === id); }
function getCliente(id) { return state.clientes.find(c => c.id === id); }

function badgeStatusVeiculo(status) {
  const map = {
    'Disponível': 'badge-green',
    'Alugado': 'badge-blue',
    'Em Manutenção': 'badge-amber',
    'Inativo': 'badge-gray'
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}
function badgeStatusLocacao(status) {
  const map = {
    'Em Andamento': 'badge-blue',
    'Atrasada': 'badge-red',
    'Concluída': 'badge-green',
    'Cancelada': 'badge-gray'
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}
function badgeStatusCliente(status) {
  return status === 'Ativo' ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>';
}
function badgeStatusManutencao(status) {
  return status === 'Concluída' ? '<span class="badge badge-green">Concluída</span>' : '<span class="badge badge-amber">Em Andamento</span>';
}

/* =========================================================
   DASHBOARD
========================================================= */
function renderDashboard() {
  const disponiveis = state.veiculos.filter(v => v.status === 'Disponível').length;
  const manutencao = state.veiculos.filter(v => v.status === 'Em Manutenção').length;
  const clientesTotal = state.clientes.length;
  const ativas = state.locacoes.filter(l => l.status === 'Em Andamento' || l.status === 'Atrasada').length;

  document.getElementById('kpiDisponiveis').textContent = disponiveis;
  document.getElementById('kpiManutencao').textContent = manutencao;
  document.getElementById('kpiClientes').textContent = clientesTotal;
  document.getElementById('kpiLocacoes').textContent = ativas;

  const tbody = document.getElementById('dashLocacoesBody');
  const empty = document.getElementById('dashLocacoesEmpty');
  const ativasLocacoes = state.locacoes.filter(l => l.status === 'Em Andamento' || l.status === 'Atrasada');

  tbody.innerHTML = ativasLocacoes.map(loc => {
    const cliente = getCliente(loc.clienteId);
    const veiculo = getVeiculo(loc.veiculoId);
    return `
      <tr>
        <td class="mono">${loc.codigo}</td>
        <td>${cliente ? cliente.nome : '—'}</td>
        <td>${veiculo ? `${veiculo.marca} ${veiculo.modelo}` : '—'}</td>
        <td>${formatDateBR(loc.dataRetornoPrevista)}</td>
        <td>${badgeStatusLocacao(loc.status)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" data-action="devolucao" data-id="${loc.id}">
            <i class="fa-solid fa-right-to-bracket"></i> Devolução
          </button>
        </td>
      </tr>`;
  }).join('');

  empty.style.display = ativasLocacoes.length ? 'none' : 'block';

  const faturamento = state.locacoes
    .filter(l => l.status === 'Concluída' || l.status === 'Em Andamento' || l.status === 'Atrasada')
    .reduce((acc, l) => acc + (Number(l.valorTotal) || 0), 0);
  document.getElementById('revenueValue').textContent = formatCurrency(faturamento);
  const maxRef = Math.max(faturamento, 5000);
  document.getElementById('revenueBarFill').style.width = Math.min(100, (faturamento / maxRef) * 100) + '%';

  // Atualiza os gráficos
  renderGraficosDashboard();
}

/* ---------------------------------------------------------
   GRÁFICOS DO DASHBOARD
--------------------------------------------------------- */
function renderGraficosDashboard() {
  // 1. Gráfico de Evolução Mensal (linha)
  const faturamentoPorMes = {};
  const mesesOrdenados = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  
  state.locacoes.forEach(loc => {
    if (loc.dataInicio && (loc.status === 'Concluída' || loc.status === 'Em Andamento' || loc.status === 'Atrasada')) {
      const data = new Date(loc.dataInicio + 'T00:00:00');
      const mesNome = mesesOrdenados[data.getMonth()];
      faturamentoPorMes[mesNome] = (faturamentoPorMes[mesNome] || 0) + (Number(loc.valorTotal) || 0);
    }
  });

  const labelsMeses = Object.keys(faturamentoPorMes).length ? Object.keys(faturamentoPorMes) : ['Sem dados'];
  const dataMeses = Object.keys(faturamentoPorMes).length ? Object.values(faturamentoPorMes) : [0];

  const ctxEvolucao = document.getElementById('chartEvolucaoMensal').getContext('2d');
  if (chartEvolucaoInstance) chartEvolucaoInstance.destroy();
  
  chartEvolucaoInstance = new Chart(ctxEvolucao, {
    type: 'line',
    data: {
      labels: labelsMeses,
      datasets: [{
        label: 'Faturamento (R$)',
        data: dataMeses,
        borderColor: '#2F6FED',
        backgroundColor: 'rgba(47, 111, 237, 0.12)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointBackgroundColor: '#2F6FED'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(227, 232, 241, 0.5)' } },
        x: { grid: { display: false } }
      }
    }
  });

  // 2. Ranking de Veículos Mais Alugados
  const contagemCarros = {};
  state.locacoes.forEach(loc => {
    contagemCarros[loc.veiculoId] = (contagemCarros[loc.veiculoId] || 0) + 1;
  });

  const topCarrosList = Object.entries(contagemCarros)
    .map(([vId, qtd]) => {
      const v = getVeiculo(vId);
      return { nome: v ? `${v.marca} ${v.modelo}` : 'Desconhecido', qtd };
    })
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 5);

  const ctxCarros = document.getElementById('chartTopCarros').getContext('2d');
  if (chartTopCarrosInstance) chartTopCarrosInstance.destroy();

  chartTopCarrosInstance = new Chart(ctxCarros, {
    type: 'bar',
    data: {
      labels: topCarrosList.map(c => c.nome),
      datasets: [{
        label: 'Total de Locações',
        data: topCarrosList.map(c => c.qtd),
        backgroundColor: '#7C6FE8',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1 } },
        y: { grid: { display: false } }
      }
    }
  });

  // 3. Ranking de Clientes por Receita
  // 3. Ranking de Clientes por Receita
  const faturamentoClientes = {};
  state.locacoes.forEach(loc => {
    if (loc.status !== 'Cancelada') {
      faturamentoClientes[loc.clienteId] = (faturamentoClientes[loc.clienteId] || 0) + (Number(loc.valorTotal) || 0);
    }
  });

  const topClientesList = Object.entries(faturamentoClientes)
    .map(([cId, total]) => {
      const c = getCliente(cId);
      return { nome: c ? c.nome : 'Desconhecido', total };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const ctxClientes = document.getElementById('chartTopClientes').getContext('2d');
  if (chartTopClientesInstance) chartTopClientesInstance.destroy();

  chartTopClientesInstance = new Chart(ctxClientes, {
    type: 'bar',
    data: {
      labels: topClientesList.map(c => c.nome),
      datasets: [{
        label: 'Total Gasto (R$)',
        data: topClientesList.map(c => c.total),
        backgroundColor: '#17A673',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true },
        y: { grid: { display: false } }
      }
    }
  });
} // <-- FIM DA FUNÇÃO (SEM CHAMADA RECURSIVA)

/* =========================================================
   FUNÇÃO PARA ALTERNAR RANKINGS
========================================================= */
function alternarRanking(tipo) {
  // Atualiza os botões (chips)
  document.querySelectorAll('.ranking-tabs .chip').forEach(chip => {
    chip.classList.remove('active');
  });
  
  if (tipo === 'carros') {
    document.getElementById('btnRankCarros').classList.add('active');
    document.getElementById('wrapperRankCarros').style.display = 'block';
    document.getElementById('wrapperRankClientes').style.display = 'none';
  } else {
    document.getElementById('btnRankClientes').classList.add('active');
    document.getElementById('wrapperRankCarros').style.display = 'none';
    document.getElementById('wrapperRankClientes').style.display = 'block';
  }
}

/* =========================================================
   CATÁLOGO — CARROSSEL 3D
========================================================= */
function categoriasDisponiveis() {
  const cats = Array.from(new Set(state.veiculos.map(v => v.categoria))).sort();
  return ['Todos', ...cats];
}

function catalogoListaFiltrada() {
  const { categoriaAtiva } = state.catalogo;
  const lista = categoriaAtiva === 'Todos'
    ? [...state.veiculos]  // Cria uma cópia para não modificar o original
    : state.veiculos.filter(v => v.categoria === categoriaAtiva);
  
  // Ordena do menor para o maior valor de diária
  return lista.sort((a, b) => a.diaria - b.diaria);
}

function renderCategoryChips() {
  const wrap = document.getElementById('categoryChips');
  const cats = categoriasDisponiveis();
  wrap.innerHTML = cats.map(cat => `
    <button class="chip ${cat === state.catalogo.categoriaAtiva ? 'active' : ''}" data-cat="${cat}">
      ${cat}
    </button>`).join('');
  wrap.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.catalogo.categoriaAtiva = chip.dataset.cat;
      state.catalogo.centerIndex = 0;
      renderCatalogo();
    });
  });
}

function renderCatalogo() {
  renderCategoryChips();
  const lista = catalogoListaFiltrada();
  state.catalogo.lista = lista;

  if (state.catalogo.centerIndex >= lista.length) state.catalogo.centerIndex = Math.max(0, lista.length - 1);

  const stage = document.getElementById('coverflowStage');
  const dotsWrap = document.getElementById('coverflowDots');

  if (!lista.length) {
    stage.innerHTML = `<div class="empty-state"><i class="fa-regular fa-folder-open"></i><p>Nenhum veículo nesta categoria.</p></div>`;
    dotsWrap.innerHTML = '';
    document.getElementById('catalogFeaturedTitle').textContent = 'Nenhum veículo encontrado';
    document.getElementById('catalogFeaturedDesc').textContent = 'Tente selecionar outra categoria.';
    document.getElementById('catalogFeaturedMeta').innerHTML = '';
    return;
  }

  stage.innerHTML = lista.map((v, i) => `
    <div class="cover-card" data-index="${i}" data-id="${v.id}">
      <span class="cover-card-status">${badgeStatusVeiculo(v.status)}</span>
      <img src="${v.imagem}" alt="${v.marca} ${v.modelo}" loading="lazy">
      <div class="cover-card-info">
        <span class="cover-card-cat">${v.categoria}</span>
        <div class="cover-card-title">${v.marca} ${v.modelo}</div>
        <div class="cover-card-price">${formatCurrency(v.diaria)} / dia</div>
      </div>
    </div>`).join('');

  stage.querySelectorAll('.cover-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = Number(card.dataset.index);
      if (idx === state.catalogo.centerIndex) {
        abrirDetalheVeiculo(card.dataset.id);
      } else {
        state.catalogo.centerIndex = idx;
        posicionarCoverflow();
      }
    });
  });

  dotsWrap.innerHTML = lista.map((_, i) => `<button class="cf-dot ${i === state.catalogo.centerIndex ? 'active' : ''}" data-index="${i}"></button>`).join('');
  dotsWrap.querySelectorAll('.cf-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      state.catalogo.centerIndex = Number(dot.dataset.index);
      posicionarCoverflow();
    });
  });

  posicionarCoverflow();
}

function posicionarCoverflow() {
  const lista = state.catalogo.lista;
  const center = state.catalogo.centerIndex;
  const stage = document.getElementById('coverflowStage');
  const isMobile = window.innerWidth <= 560;
  const spacing = isMobile ? 108 : 165;

  stage.querySelectorAll('.cover-card').forEach(card => {
    const idx = Number(card.dataset.index);
    const offset = idx - center;
    const abs = Math.abs(offset);
    card.classList.toggle('is-center', offset === 0);

    if (abs > 4) {
      card.style.opacity = '0';
      card.style.pointerEvents = 'none';
      card.style.transform = `translateX(${offset * spacing}px) scale(.5)`;
      return;
    }
    card.style.pointerEvents = 'auto';
    const scale = offset === 0 ? 1 : Math.max(0.62, 0.9 - abs * 0.12);
    const rotate = offset === 0 ? 0 : (offset > 0 ? -32 : 32);
    const translateX = offset * spacing;
    const translateZ = offset === 0 ? 40 : -Math.abs(offset) * 60;
    const opacity = offset === 0 ? 1 : Math.max(0.35, 1 - abs * 0.22);

    card.style.zIndex = String(50 - abs);
    card.style.opacity = String(opacity);
    card.style.transform = `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotate}deg) scale(${scale})`;
  });

  document.querySelectorAll('.cf-dot').forEach((dot, i) => dot.classList.toggle('active', i === center));

  const veiculo = lista[center];
  if (veiculo) atualizarHeroCatalogo(veiculo);
}

function atualizarHeroCatalogo(v) {
  document.getElementById('catalogFeaturedTitle').textContent = `${v.marca} ${v.modelo} (${v.ano})`;
  document.getElementById('catalogFeaturedDesc').textContent =
    `${v.categoria} disponível na frota corporativa — ideal para deslocamentos executivos e operações do dia a dia.`;
  document.getElementById('catalogFeaturedMeta').innerHTML = `
    <span><i class="fa-solid fa-tag"></i> ${formatCurrency(v.diaria)} / dia</span>
    <span><i class="fa-solid fa-gauge"></i> ${Number(v.km).toLocaleString('pt-BR')} km</span>
    <span><i class="fa-solid fa-id-card"></i> ${v.placa}</span>
    ${badgeStatusVeiculo(v.status)}
  `;
  document.getElementById('catalogRentBtn').dataset.veiculoId = v.id;
  document.getElementById('catalogDetailsBtn').dataset.veiculoId = v.id;
}

function abrirDetalheVeiculo(id) {
  const v = getVeiculo(id);
  if (!v) return;
  document.getElementById('veiculoDetalheBody').innerHTML = `
    <div class="detail-flex">
      <img class="detail-img" src="${v.imagem}" alt="${v.marca} ${v.modelo}">
      <div>
        <span class="cover-card-cat">${v.categoria}</span>
        <h2 style="margin:4px 0 6px;font-size:20px;">${v.marca} ${v.modelo}</h2>
        ${badgeStatusVeiculo(v.status)}
        <div class="detail-specs">
          <div><b>Ano</b>${v.ano}</div>
          <div><b>Placa</b>${v.placa}</div>
          <div><b>Diária</b>${formatCurrency(v.diaria)}</div>
          <div><b>Quilometragem</b>${Number(v.km).toLocaleString('pt-BR')} km</div>
        </div>
      </div>
    </div>`;
  openModalRaw('veiculoDetalheModal');
}
/* =========================================================
   VEÍCULOS
========================================================= */
function getFiltroTexto(id) { return (document.getElementById(id).value || '').trim().toLowerCase(); }

function renderVeiculos() {
  const termo = getFiltroTexto('veiculoSearch');
  const statusF = document.getElementById('veiculoStatusFilter').value;

  const lista = state.veiculos
    .filter(v => {
      const matchTermo = !termo || `${v.marca} ${v.modelo} ${v.placa}`.toLowerCase().includes(termo);
      const matchStatus = !statusF || v.status === statusF;
      return matchTermo && matchStatus;
    })
    .sort((a, b) => a.diaria - b.diaria); // Ordena do menor para o maior valor de diária

  const tbody = document.getElementById('veiculosBody');
  tbody.innerHTML = lista.map(v => `
    <tr>
      <td><span class="cell-strong">${v.marca} ${v.modelo}</span><br><span class="cell-sub">${v.categoria}</span></td>
      <td>${v.ano}</td>
      <td class="mono">${v.placa}</td>
      <td>${v.categoria}</td>
      <td>${formatCurrency(v.diaria)}</td>
      <td>${badgeStatusVeiculo(v.status)}</td>
      <td>
        <div class="cell-actions">
          <button class="btn-icon" title="Editar" data-action="edit-veiculo" data-id="${v.id}"><i class="fa-solid fa-pen"></i></button>
          ${v.status === 'Inativo'
            ? `<button class="btn-icon success" title="Reativar" data-action="reativar-veiculo" data-id="${v.id}"><i class="fa-solid fa-rotate-left"></i></button>`
            : `<button class="btn-icon danger" title="Inativar" data-action="inativar-veiculo" data-id="${v.id}" ${v.status === 'Alugado' ? 'disabled' : ''}><i class="fa-solid fa-ban"></i></button>`
          }
        </div>
      </td>
    </tr>`).join('');

  document.getElementById('veiculosEmpty').style.display = lista.length ? 'none' : 'block';
}

function openVeiculoModal(veiculo = null) {
  const form = document.getElementById('veiculoForm');
  form.reset();
  document.getElementById('veiculoId').value = veiculo ? veiculo.id : '';
  document.getElementById('veiculoModalTitle').textContent = veiculo ? 'Editar Veículo' : 'Novo Veículo';
  document.getElementById('veiculoMarca').value = veiculo ? veiculo.marca : '';
  document.getElementById('veiculoModelo').value = veiculo ? veiculo.modelo : '';
  document.getElementById('veiculoAno').value = veiculo ? veiculo.ano : '';
  document.getElementById('veiculoPlaca').value = veiculo ? veiculo.placa : '';
  document.getElementById('veiculoCategoria').value = veiculo ? veiculo.categoria : '';
  document.getElementById('veiculoDiaria').value = veiculo ? veiculo.diaria : '';
  document.getElementById('veiculoKm').value = veiculo ? veiculo.km : '';
  document.getElementById('veiculoImagem').value = veiculo ? veiculo.imagem : '';
  openModalRaw('veiculoModal');
}

async function salvarVeiculo() {
  const id = document.getElementById('veiculoId').value;
  const marca = document.getElementById('veiculoMarca').value.trim();
  const modelo = document.getElementById('veiculoModelo').value.trim();
  const ano = document.getElementById('veiculoAno').value.trim();
  const placa = document.getElementById('veiculoPlaca').value.trim();
  const categoria = document.getElementById('veiculoCategoria').value;
  const diaria = parseFloat(document.getElementById('veiculoDiaria').value);
  const km = parseInt(document.getElementById('veiculoKm').value, 10);
  const imagem = document.getElementById('veiculoImagem').value.trim() ||
    `https://picsum.photos/seed/${encodeURIComponent(placa)}/700/500`;

  if (!marca || !modelo || !categoria) return toastError('Preencha todos os campos obrigatórios.');
  if (ano.length !== 4 || Number(ano) < 1990 || Number(ano) > new Date().getFullYear() + 1) {
    return toastError('Informe um ano válido com 4 dígitos.');
  }
  if (!diaria || diaria <= 0) return toastError('O valor da diária deve ser positivo.');
  if (isNaN(km) || km < 0) return toastError('A quilometragem deve ser um número positivo.');
  if (!placa) return toastError('Informe a placa do veículo.');

  const placaNorm = normPlaca(placa);
  const duplicado = state.veiculos.find(v => normPlaca(v.placa) === placaNorm && v.id !== id);
  if (duplicado) return toastError('Já existe um veículo cadastrado com essa placa.');

  const payload = { marca, modelo, ano: Number(ano), placa, categoria, diaria, km, imagem };

  try {
    if (id) {
      const atual = getVeiculo(id);
      await apiPatch('veiculos', id, payload);
      Object.assign(atual, payload);
      toastSuccess('Veículo atualizado com sucesso!');
    } else {
      payload.status = 'Disponível';
      payload.id = `v_${Date.now()}`;
      const criado = await apiPost('veiculos', payload);
      state.veiculos.push(criado);
      toastSuccess('Veículo cadastrado com sucesso!');
    }
    closeModal('veiculoModal');
    renderTudo();
  } catch (err) {
    console.error(err);
    toastError('Não foi possível salvar o veículo. Verifique a conexão com a API.');
  }
}

async function inativarVeiculo(id) {
  const v = getVeiculo(id);
  if (!v) return;
  if (v.status === 'Alugado') return toastWarn('Não é possível inativar um veículo alugado.');
  const ok = await confirmAction({
    title: 'Inativar veículo?',
    text: `${v.marca} ${v.modelo} (${v.placa}) deixará de aparecer como disponível para locação.`,
    danger: true,
    confirmText: 'Inativar'
  });
  if (!ok) return;
  try {
    await apiPatch('veiculos', id, { status: 'Inativo' });
    v.status = 'Inativo';
    toastSuccess('Veículo inativado.');
    renderTudo();
  } catch (err) { toastError('Erro ao inativar veículo.'); }
}

async function reativarVeiculo(id) {
  const v = getVeiculo(id);
  if (!v) return;
  try {
    await apiPatch('veiculos', id, { status: 'Disponível' });
    v.status = 'Disponível';
    toastSuccess('Veículo reativado e disponível novamente.');
    renderTudo();
  } catch (err) { toastError('Erro ao reativar veículo.'); }
}

/* =========================================================
   CLIENTES
========================================================= */
function renderClientes() {
  const termo = getFiltroTexto('clienteSearch');
  const statusF = document.getElementById('clienteStatusFilter').value;

  const lista = state.clientes.filter(c => {
    const matchTermo = !termo || `${c.nome} ${c.cpf} ${c.email}`.toLowerCase().includes(termo);
    const matchStatus = !statusF || c.status === statusF;
    return matchTermo && matchStatus;
  });

  const tbody = document.getElementById('clientesBody');
  tbody.innerHTML = lista.map(c => {
    const cnhSt = statusCNH(c.cnhValidade);
    const cnhBadge = cnhSt === 'vencida' ? 'badge-red' : cnhSt === 'proxima' ? 'badge-amber' : 'badge-green';
    const cnhLabel = cnhSt === 'vencida' ? 'Vencida' : cnhSt === 'proxima' ? 'A vencer' : 'Regular';
    return `
    <tr>
      <td><span class="cell-strong">${c.nome}</span><br><span class="cell-sub">${c.email}</span></td>
      <td class="mono">${c.cpf}</td>
      <td>${c.telefone}</td>
      <td class="mono">${c.cnhNumero} <span class="cell-sub">(${c.cnhCategoria})</span></td>
      <td>${formatDateBR(c.cnhValidade)} <span class="badge ${cnhBadge}" style="margin-left:6px;">${cnhLabel}</span></td>
      <td>${badgeStatusCliente(c.status)}</td>
      <td>
        <div class="cell-actions">
          <button class="btn-icon" title="Editar" data-action="edit-cliente" data-id="${c.id}"><i class="fa-solid fa-pen"></i></button>
          ${c.status === 'Inativo'
            ? `<button class="btn-icon success" title="Reativar" data-action="reativar-cliente" data-id="${c.id}"><i class="fa-solid fa-rotate-left"></i></button>`
            : `<button class="btn-icon danger" title="Inativar" data-action="inativar-cliente" data-id="${c.id}"><i class="fa-solid fa-ban"></i></button>`
          }
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('clientesEmpty').style.display = lista.length ? 'none' : 'block';
}

function openClienteModal(cliente = null) {
  const form = document.getElementById('clienteForm');
  form.reset();
  document.getElementById('clienteId').value = cliente ? cliente.id : '';
  document.getElementById('clienteModalTitle').textContent = cliente ? 'Editar Cliente' : 'Novo Cliente';
  document.getElementById('clienteNome').value = cliente ? cliente.nome : '';
  document.getElementById('clienteCpf').value = cliente ? cliente.cpf : '';
  document.getElementById('clienteNascimento').value = cliente ? cliente.dataNascimento : '';
  document.getElementById('clienteTelefone').value = cliente ? cliente.telefone : '';
  document.getElementById('clienteEmail').value = cliente ? cliente.email : '';
  document.getElementById('clienteCep').value = cliente ? cliente.cep : '';
  document.getElementById('clienteCnhNumero').value = cliente ? cliente.cnhNumero : '';
  document.getElementById('clienteCnhCategoria').value = cliente ? cliente.cnhCategoria : '';
  document.getElementById('clienteCnhValidade').value = cliente ? cliente.cnhValidade : '';
  openModalRaw('clienteModal');
}

async function salvarCliente() {
  const id = document.getElementById('clienteId').value;
  const nome = document.getElementById('clienteNome').value.trim();
  const cpf = document.getElementById('clienteCpf').value.trim();
  const nascimento = document.getElementById('clienteNascimento').value;
  const telefone = document.getElementById('clienteTelefone').value.trim();
  const email = document.getElementById('clienteEmail').value.trim();
  const cep = document.getElementById('clienteCep').value.trim();
  const cnhNumero = document.getElementById('clienteCnhNumero').value.trim();
  const cnhCategoria = document.getElementById('clienteCnhCategoria').value;
  const cnhValidade = document.getElementById('clienteCnhValidade').value;

  if (!nome || !telefone || !email || !cnhNumero || !cnhCategoria || !cnhValidade || !nascimento) {
    return toastError('Preencha todos os campos obrigatórios.');
  }
  if (!validarCPF(cpf)) return toastError('CPF inválido. Verifique os números digitados.');
  if (!validarEmail(email)) return toastError('Informe um e-mail válido.');

  const cpfNorm = normDigits(cpf);
  const emailNorm = email.toLowerCase();
  const cpfDuplicado = state.clientes.find(c => normDigits(c.cpf) === cpfNorm && c.id !== id);
  if (cpfDuplicado) return toastError('Já existe um cliente cadastrado com esse CPF.');
  const emailDuplicado = state.clientes.find(c => c.email.toLowerCase() === emailNorm && c.id !== id);
  if (emailDuplicado) return toastError('Já existe um cliente cadastrado com esse e-mail.');

  const idade = idadeAnos(nascimento);
  if (idade < 21) {
    await Swal.fire({
      icon: 'error',
      title: 'Cliente menor de 21 anos',
      text: 'A locação não pode ser realizada para clientes com menos de 21 anos.'
    });
    return;
  }

  const cnhSt = statusCNH(cnhValidade);
  if (cnhSt === 'vencida') return toastError('A CNH informada está vencida. Não é possível concluir o cadastro.');
  if (cnhSt === 'proxima') toastWarn('Atenção: a CNH deste cliente vence em menos de 30 dias.');

  const payload = { nome, cpf, dataNascimento: nascimento, telefone, email, cep, cnhNumero, cnhCategoria, cnhValidade };

  try {
    if (id) {
      const atual = getCliente(id);
      await apiPatch('clientes', id, payload);
      Object.assign(atual, payload);
      toastSuccess('Cliente atualizado com sucesso!');
    } else {
      payload.status = 'Ativo';
      payload.id = `c_${Date.now()}`;
      const criado = await apiPost('clientes', payload);
      state.clientes.push(criado);
      toastSuccess('Cliente cadastrado com sucesso!');
    }
    closeModal('clienteModal');
    renderTudo();
  } catch (err) {
    console.error(err);
    toastError('Não foi possível salvar o cliente. Verifique a conexão com a API.');
  }
}

async function inativarCliente(id) {
  const c = getCliente(id);
  if (!c) return;
  const temLocacaoAtiva = state.locacoes.some(l => l.clienteId === id && (l.status === 'Em Andamento' || l.status === 'Atrasada'));
  if (temLocacaoAtiva) return toastWarn('Este cliente possui uma locação em andamento e não pode ser inativado.');
  const ok = await confirmAction({
    title: 'Inativar cliente?',
    text: `${c.nome} não poderá mais realizar novas locações.`,
    danger: true,
    confirmText: 'Inativar'
  });
  if (!ok) return;
  try {
    await apiPatch('clientes', id, { status: 'Inativo' });
    c.status = 'Inativo';
    toastSuccess('Cliente inativado.');
    renderTudo();
  } catch (err) { toastError('Erro ao inativar cliente.'); }
}

async function reativarCliente(id) {
  const c = getCliente(id);
  if (!c) return;
  try {
    await apiPatch('clientes', id, { status: 'Ativo' });
    c.status = 'Ativo';
    toastSuccess('Cliente reativado.');
    renderTudo();
  } catch (err) { toastError('Erro ao reativar cliente.'); }
}

/* =========================================================
   LOCAÇÕES
========================================================= */
function renderLocacoes() {
  const termo = getFiltroTexto('locacaoSearch');
  const statusF = document.getElementById('locacaoStatusFilter').value;

  const lista = state.locacoes.filter(l => {
    const cliente = getCliente(l.clienteId);
    const veiculo = getVeiculo(l.veiculoId);
    const texto = `${l.codigo} ${cliente ? cliente.nome : ''} ${veiculo ? veiculo.marca + ' ' + veiculo.modelo + ' ' + veiculo.placa : ''}`.toLowerCase();
    const matchTermo = !termo || texto.includes(termo);
    const matchStatus = !statusF || l.status === statusF;
    return matchTermo && matchStatus;
  }).sort((a, b) => (a.dataInicio < b.dataInicio ? 1 : -1));

  const tbody = document.getElementById('locacoesBody');
  tbody.innerHTML = lista.map(l => {
    const cliente = getCliente(l.clienteId);
    const veiculo = getVeiculo(l.veiculoId);
    const podeDevolver = l.status === 'Em Andamento' || l.status === 'Atrasada';
    const podeCancelar = l.status === 'Em Andamento' || l.status === 'Atrasada';
    return `
    <tr>
      <td class="mono">${l.codigo}</td>
      <td>${cliente ? cliente.nome : '—'}</td>
      <td>${veiculo ? `${veiculo.marca} ${veiculo.modelo}` : '—'} <span class="cell-sub mono">${veiculo ? veiculo.placa : ''}</span></td>
      <td>${formatDateBR(l.dataInicio)}</td>
      <td>${formatDateBR(l.dataRetornoPrevista)}</td>
      <td>${formatCurrency(l.valorTotal)}</td>
      <td>${badgeStatusLocacao(l.status)}</td>
      <td>
        <div class="cell-actions">
          ${podeDevolver ? `<button class="btn-icon success" title="Registrar devolução" data-action="devolucao" data-id="${l.id}"><i class="fa-solid fa-right-to-bracket"></i></button>` : ''}
          ${podeCancelar ? `<button class="btn-icon danger" title="Cancelar locação" data-action="cancelar-locacao" data-id="${l.id}"><i class="fa-solid fa-ban"></i></button>` : ''}
          ${!podeDevolver && !podeCancelar ? `<button class="btn-icon" title="Excluir registro" data-action="excluir-locacao" data-id="${l.id}"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('locacoesEmpty').style.display = lista.length ? 'none' : 'block';
}

function proximoCodigoLocacao() {
  const nums = state.locacoes
    .map(l => parseInt((l.codigo || '').replace(/\D/g, ''), 10))
    .filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `LOC-${String(max + 1).padStart(4, '0')}`;
}

function openLocacaoModal(veiculoPreSelecionadoId = null) {
  const form = document.getElementById('locacaoForm');
  form.reset();

  const selCliente = document.getElementById('locacaoCliente');
  selCliente.innerHTML = state.clientes
    .filter(c => c.status === 'Ativo')
    .map(c => `<option value="${c.id}">${c.nome} — CPF: ${c.cpf} (CNH ${c.cnhCategoria})</option>`).join('') ||
    `<option value="">Nenhum cliente ativo cadastrado</option>`;

  const selVeiculo = document.getElementById('locacaoVeiculo');
  const disponiveis = state.veiculos.filter(v => v.status === 'Disponível');
  selVeiculo.innerHTML = disponiveis
    .map(v => `<option value="${v.id}" data-diaria="${v.diaria}">${v.marca} ${v.modelo} — ${v.placa} (${v.categoria} - ${formatCurrency(v.diaria)}/dia)</option>`).join('') ||
    `<option value="">Nenhum veículo disponível</option>`;

  if (veiculoPreSelecionadoId) selVeiculo.value = veiculoPreSelecionadoId;

  document.getElementById('locacaoInicio').min = todayISO();
  document.getElementById('locacaoInicio').value = todayISO();
  document.getElementById('locacaoValorEstimado').value = '';
  document.getElementById('locacaoKmInicial').value = '';

  const veiculoAtual = getVeiculo(selVeiculo.value);
  if (veiculoAtual) document.getElementById('locacaoKmInicial').value = veiculoAtual.km;

  atualizarValorEstimado();
  openModalRaw('locacaoModal');
}

function atualizarValorEstimado() {
  const veiculoId = document.getElementById('locacaoVeiculo').value;
  const inicio = document.getElementById('locacaoInicio').value;
  const retorno = document.getElementById('locacaoRetorno').value;
  const veiculo = getVeiculo(veiculoId);
  const campo = document.getElementById('locacaoValorEstimado');
  if (!veiculo || !inicio || !retorno) { campo.value = ''; return; }
  const dias = diffDays(inicio, retorno);
  if (dias <= 0) { campo.value = 'Datas inválidas'; return; }
  campo.value = formatCurrency(dias * veiculo.diaria) + `  (${dias} diária${dias > 1 ? 's' : ''})`;
}

async function salvarLocacao() {
  const clienteId = document.getElementById('locacaoCliente').value;
  const veiculoId = document.getElementById('locacaoVeiculo').value;
  const inicio = document.getElementById('locacaoInicio').value;
  const retorno = document.getElementById('locacaoRetorno').value;
  const kmInicial = parseInt(document.getElementById('locacaoKmInicial').value, 10);

  if (!clienteId || !veiculoId || !inicio || !retorno) return toastError('Preencha todos os campos da locação.');

  const cliente = getCliente(clienteId);
  const veiculo = getVeiculo(veiculoId);
  if (!cliente || !veiculo) return toastError('Cliente ou veículo inválido.');
  if (veiculo.status !== 'Disponível') return toastError('Este veículo não está mais disponível.');

  /* REGRA DE NEGÓCIO: Utilitário só com CNH Categoria D ou E */
  if (veiculo.categoria === 'Utilitário') {
    const catCnh = (cliente.cnhCategoria || '').toUpperCase();
    if (catCnh !== 'D' && catCnh !== 'E') {
      return alertError(
        'CNH Incompatível',
        `O veículo selecionado é da categoria "Utilitário". Apenas clientes com CNH categoria D ou E podem realizar este aluguel (CNH do cliente: ${catCnh || 'não informada'}).`
      );
    }
  }

  if (isBeforeToday(inicio)) return toastError('A data de início não pode ser no passado.');
  if (retorno <= inicio) return toastError('A data de retorno deve ser posterior à data de início.');
  if (isNaN(kmInicial) || kmInicial < 0) return toastError('Informe a quilometragem inicial.');

  const cnhSt = statusCNH(cliente.cnhValidade);
  if (cnhSt === 'vencida') return toastError('O cliente selecionado está com a CNH vencida.');

  const temAtraso = state.locacoes.some(l => l.clienteId === clienteId && l.status === 'Atrasada');
  if (temAtraso) return toastError('Este cliente possui locações em atraso e não pode alugar novos veículos.');

  const dias = diffDays(inicio, retorno);
  const valorTotal = Number((dias * veiculo.diaria).toFixed(2));

  const payload = {
    id: `l_${Date.now()}`,
    codigo: proximoCodigoLocacao(),
    clienteId, veiculoId,
    dataInicio: inicio,
    dataRetornoPrevista: retorno,
    dataRetornoReal: null,
    kmInicial, kmFinal: null,
    valorTotal,
    status: 'Em Andamento'
  };

  try {
    const criada = await apiPost('locacoes', payload);
    state.locacoes.push(criada);
    await apiPatch('veiculos', veiculoId, { status: 'Alugado' });
    veiculo.status = 'Alugado';
    toastSuccess(`Locação ${payload.codigo} registrada com sucesso!`);
    closeModal('locacaoModal');
    renderTudo();
  } catch (err) {
    console.error(err);
    toastError('Não foi possível registrar a locação. Verifique a conexão com a API.');
  }
}

async function registrarDevolucao(locacaoId) {
  const loc = state.locacoes.find(l => l.id === locacaoId);
  if (!loc) return;
  const veiculo = getVeiculo(loc.veiculoId);

  const { value: kmFinal } = await Swal.fire({
    title: 'Registrar devolução',
    html: `Informe a quilometragem final de <b>${veiculo ? veiculo.marca + ' ' + veiculo.modelo : 'veículo'}</b> (${veiculo ? veiculo.placa : ''})`,
    input: 'number',
    inputAttributes: { min: loc.kmInicial || 0, step: 1 },
    inputValue: veiculo ? veiculo.km : loc.kmInicial,
    showCancelButton: true,
    confirmButtonText: 'Confirmar devolução',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#2F6FED',
    cancelButtonColor: '#94A0B4',
    inputValidator: (value) => {
      if (!value && value !== 0) return 'Informe a quilometragem final.';
      if (Number(value) < loc.kmInicial) return `A quilometragem final não pode ser menor que a inicial (${loc.kmInicial} km).`;
    }
  });

  if (kmFinal === undefined) return;

  try {
    const hoje = todayISO();
    await apiPatch('locacoes', loc.id, { status: 'Concluída', dataRetornoReal: hoje, kmFinal: Number(kmFinal) });
    loc.status = 'Concluída'; loc.dataRetornoReal = hoje; loc.kmFinal = Number(kmFinal);

    if (veiculo) {
      await apiPatch('veiculos', veiculo.id, { status: 'Disponível', km: Number(kmFinal) });
      veiculo.status = 'Disponível'; veiculo.km = Number(kmFinal);
    }
    toastSuccess(`Devolução da locação ${loc.codigo} registrada com sucesso!`);
    renderTudo();
  } catch (err) {
    console.error(err);
    toastError('Não foi possível registrar a devolução.');
  }
}

async function cancelarLocacao(locacaoId) {
  const loc = state.locacoes.find(l => l.id === locacaoId);
  if (!loc) return;
  const ok = await confirmAction({
    title: 'Cancelar locação?',
    text: `A locação ${loc.codigo} será cancelada e o veículo voltará a ficar disponível.`,
    danger: true,
    confirmText: 'Cancelar locação'
  });
  if (!ok) return;
  try {
    await apiPatch('locacoes', loc.id, { status: 'Cancelada' });
    loc.status = 'Cancelada';
    const veiculo = getVeiculo(loc.veiculoId);
    if (veiculo && veiculo.status === 'Alugado') {
      await apiPatch('veiculos', veiculo.id, { status: 'Disponível' });
      veiculo.status = 'Disponível';
    }
    toastSuccess(`Locação ${loc.codigo} cancelada.`);
    renderTudo();
  } catch (err) { toastError('Erro ao cancelar locação.'); }
}

async function excluirLocacao(locacaoId) {
  const loc = state.locacoes.find(l => l.id === locacaoId);
  if (!loc) return;
  const ok = await confirmAction({
    title: 'Excluir registro de locação?',
    text: `O registro ${loc.codigo} será removido permanentemente do sistema.`,
    danger: true,
    confirmText: 'Excluir'
  });
  if (!ok) return;
  try {
    await apiDelete('locacoes', loc.id);
    state.locacoes = state.locacoes.filter(l => l.id !== loc.id);
    toastSuccess('Registro de locação excluído.');
    renderTudo();
  } catch (err) { toastError('Erro ao excluir locação.'); }
}

/* =========================================================
   MANUTENÇÃO
========================================================= */
function renderManutencoes() {
  const termo = getFiltroTexto('manutencaoSearch');
  const statusF = document.getElementById('manutencaoStatusFilter').value;

  const lista = state.manutencoes.filter(m => {
    const veiculo = getVeiculo(m.veiculoId);
    const texto = `${veiculo ? veiculo.marca + ' ' + veiculo.modelo + ' ' + veiculo.placa : ''} ${m.tipo}`.toLowerCase();
    const matchTermo = !termo || texto.includes(termo);
    const matchStatus = !statusF || m.status === statusF;
    return matchTermo && matchStatus;
  }).sort((a, b) => (a.dataInicio < b.dataInicio ? 1 : -1));

  const tbody = document.getElementById('manutencoesBody');
  tbody.innerHTML = lista.map(m => {
    const veiculo = getVeiculo(m.veiculoId);
    return `
    <tr>
      <td><span class="cell-strong">${veiculo ? veiculo.marca + ' ' + veiculo.modelo : '—'}</span><br><span class="cell-sub mono">${veiculo ? veiculo.placa : ''}</span></td>
      <td>${m.tipo}</td>
      <td>${formatDateBR(m.dataInicio)}</td>
      <td>${formatDateBR(m.dataPrevisaoFim)}</td>
      <td>${formatCurrency(m.custo)}</td>
      <td>${badgeStatusManutencao(m.status)}</td>
      <td>
        <div class="cell-actions">
          ${m.status === 'Em Andamento' ? `<button class="btn-icon success" title="Concluir manutenção" data-action="concluir-manutencao" data-id="${m.id}"><i class="fa-solid fa-check"></i></button>` : ''}
          <button class="btn-icon danger" title="Excluir registro" data-action="excluir-manutencao" data-id="${m.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('manutencoesEmpty').style.display = lista.length ? 'none' : 'block';
}

function openManutencaoModal() {
  const form = document.getElementById('manutencaoForm');
  form.reset();

  const sel = document.getElementById('manutencaoVeiculo');
  const disponiveis = state.veiculos.filter(v => v.status === 'Disponível');
  sel.innerHTML = disponiveis.map(v => `<option value="${v.id}">${v.marca} ${v.modelo} — ${v.placa}</option>`).join('') ||
    `<option value="">Nenhum veículo disponível para manutenção</option>`;

  document.getElementById('manutencaoInicio').value = todayISO();
  document.getElementById('manutencaoInicio').min = todayISO();
  openModalRaw('manutencaoModal');
}

async function salvarManutencao() {
  const veiculoId = document.getElementById('manutencaoVeiculo').value;
  const tipo = document.getElementById('manutencaoTipo').value;
  const custo = parseFloat(document.getElementById('manutencaoCusto').value);
  const inicio = document.getElementById('manutencaoInicio').value;
  const previsao = document.getElementById('manutencaoPrevisao').value;
  const descricao = document.getElementById('manutencaoDescricao').value.trim();

  if (!veiculoId) return toastError('Selecione um veículo disponível.');
  if (!tipo) return toastError('Selecione o tipo de manutenção.');
  if (isNaN(custo) || custo < 0) return toastError('Informe um custo válido.');
  if (!inicio || !previsao) return toastError('Informe as datas de início e previsão.');
  if (previsao < inicio) return toastError('A previsão de conclusão deve ser igual ou posterior ao início.');

  const veiculo = getVeiculo(veiculoId);
  if (!veiculo || veiculo.status !== 'Disponível') return toastError('Este veículo não está disponível para manutenção.');

  const payload = {
    id: `m_${Date.now()}`,
    veiculoId, tipo, descricao, custo,
    dataInicio: inicio, dataPrevisaoFim: previsao, dataFim: null,
    status: 'Em Andamento'
  };

  try {
    const criada = await apiPost('manutencoes', payload);
    state.manutencoes.push(criada);
    await apiPatch('veiculos', veiculoId, { status: 'Em Manutenção' });
    veiculo.status = 'Em Manutenção';
    toastSuccess('Manutenção registrada com sucesso!');
    closeModal('manutencaoModal');
    renderTudo();
  } catch (err) {
    console.error(err);
    toastError('Não foi possível registrar a manutenção.');
  }
}

async function concluirManutencao(id) {
  const m = state.manutencoes.find(x => x.id === id);
  if (!m) return;
  const ok = await confirmAction({
    title: 'Concluir manutenção?',
    text: 'O veículo voltará a ficar disponível para locação.',
    confirmText: 'Concluir'
  });
  if (!ok) return;
  try {
    const hoje = todayISO();
    await apiPatch('manutencoes', id, { status: 'Concluída', dataFim: hoje });
    m.status = 'Concluída'; m.dataFim = hoje;
    const veiculo = getVeiculo(m.veiculoId);
    if (veiculo) {
      await apiPatch('veiculos', veiculo.id, { status: 'Disponível' });
      veiculo.status = 'Disponível';
    }
    toastSuccess('Manutenção concluída. Veículo disponível novamente.');
    renderTudo();
  } catch (err) { toastError('Erro ao concluir manutenção.'); }
}

async function excluirManutencao(id) {
  const ok = await confirmAction({
    title: 'Excluir registro de manutenção?',
    text: 'Esta ação não pode ser desfeita.',
    danger: true,
    confirmText: 'Excluir'
  });
  if (!ok) return;
  try {
    await apiDelete('manutencoes', id);
    state.manutencoes = state.manutencoes.filter(m => m.id !== id);
    toastSuccess('Registro de manutenção excluído.');
    renderTudo();
  } catch (err) { toastError('Erro ao excluir manutenção.'); }
}

/* =========================================================
   MODAIS — helpers genéricos
========================================================= */
function openModalRaw(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function handleOpenModalGeneric(modalId) {
  switch (modalId) {
    case 'veiculoModal': openVeiculoModal(); break;
    case 'clienteModal': openClienteModal(); break;
    case 'locacaoModal': openLocacaoModal(); break;
    case 'manutencaoModal': openManutencaoModal(); break;
    default: openModalRaw(modalId);
  }
}

/* =========================================================
   NAVEGAÇÃO SPA
========================================================= */
const TITULOS = {
  dashboard: 'Dashboard',
  catalogo: 'Catálogo',
  veiculos: 'Veículos',
  clientes: 'Clientes',
  locacoes: 'Locações',
  manutencao: 'Manutenção'
};

function irParaSecao(secao) {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.section === secao));
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${secao}`));
  document.getElementById('pageTitle').textContent = TITULOS[secao] || secao;
  fecharSidebarMobile();
}

function fecharSidebarMobile() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

/* =========================================================
   EVENTOS
========================================================= */
function bindEventos() {
  // Navegação principal
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => irParaSecao(item.dataset.section));
  });
  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => irParaSecao(btn.dataset.goto));
  });

  // Sidebar mobile
  document.getElementById('burgerBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('open');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', fecharSidebarMobile);

  // Abertura/fechamento genérico de modais
  document.querySelectorAll('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', () => handleOpenModalGeneric(btn.dataset.openModal));
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay.id); });
  });

  // Máscaras
  document.getElementById('veiculoPlaca').addEventListener('input', (e) => { e.target.value = maskPlaca(e.target.value); });
  document.getElementById('veiculoAno').addEventListener('input', (e) => { e.target.value = maskAno(e.target.value); });
  document.getElementById('clienteCpf').addEventListener('input', (e) => { e.target.value = maskCPF(e.target.value); });
  document.getElementById('clienteTelefone').addEventListener('input', (e) => { e.target.value = maskTelefone(e.target.value); });
  document.getElementById('clienteCep').addEventListener('input', (e) => { e.target.value = maskCEP(e.target.value); });
  document.getElementById('clienteCnhNumero').addEventListener('input', (e) => { e.target.value = normDigits(e.target.value).slice(0, 11); });

  // Formulários (submit)
  document.getElementById('veiculoForm').addEventListener('submit', (e) => { e.preventDefault(); salvarVeiculo(); });
  document.getElementById('veiculoSaveBtn').addEventListener('click', () => salvarVeiculo());
  document.getElementById('clienteForm').addEventListener('submit', (e) => { e.preventDefault(); salvarCliente(); });
  document.getElementById('clienteSaveBtn').addEventListener('click', () => salvarCliente());
  document.getElementById('locacaoForm').addEventListener('submit', (e) => { e.preventDefault(); salvarLocacao(); });
  document.getElementById('locacaoSaveBtn').addEventListener('click', () => salvarLocacao());
  document.getElementById('manutencaoForm').addEventListener('submit', (e) => { e.preventDefault(); salvarManutencao(); });
  document.getElementById('manutencaoSaveBtn').addEventListener('click', () => salvarManutencao());

  // Cálculo automático do valor estimado da locação
  ['locacaoVeiculo', 'locacaoInicio', 'locacaoRetorno'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      if (id === 'locacaoVeiculo') {
        const veiculo = getVeiculo(document.getElementById('locacaoVeiculo').value);
        if (veiculo) document.getElementById('locacaoKmInicial').value = veiculo.km;
      }
      atualizarValorEstimado();
    });
  });

  // Filtros e buscas
  document.getElementById('veiculoSearch').addEventListener('input', debounce(renderVeiculos, 150));
  document.getElementById('veiculoStatusFilter').addEventListener('change', renderVeiculos);
  document.getElementById('clienteSearch').addEventListener('input', debounce(renderClientes, 150));
  document.getElementById('clienteStatusFilter').addEventListener('change', renderClientes);
  document.getElementById('locacaoSearch').addEventListener('input', debounce(renderLocacoes, 150));
  document.getElementById('locacaoStatusFilter').addEventListener('change', renderLocacoes);
  document.getElementById('manutencaoSearch').addEventListener('input', debounce(renderManutencoes, 150));
  document.getElementById('manutencaoStatusFilter').addEventListener('change', renderManutencoes);

  // Busca global do topo
  document.getElementById('globalSearch').addEventListener('input', debounce((e) => {
    const termo = e.target.value;
    const secaoAtiva = document.querySelector('.nav-item.active').dataset.section;
    const mapa = {
      veiculos: ['veiculoSearch', renderVeiculos],
      clientes: ['clienteSearch', renderClientes],
      locacoes: ['locacaoSearch', renderLocacoes],
      manutencao: ['manutencaoSearch', renderManutencoes]
    };
    if (mapa[secaoAtiva]) {
      const [inputId, renderFn] = mapa[secaoAtiva];
      document.getElementById(inputId).value = termo;
      renderFn();
    }
  }, 200));

  // Coverflow — navegação
  document.getElementById('coverPrev').addEventListener('click', () => {
    if (state.catalogo.centerIndex > 0) { state.catalogo.centerIndex--; posicionarCoverflow(); }
  });
  document.getElementById('coverNext').addEventListener('click', () => {
    if (state.catalogo.centerIndex < state.catalogo.lista.length - 1) { state.catalogo.centerIndex++; posicionarCoverflow(); }
  });
  document.getElementById('catalogRentBtn').addEventListener('click', () => {
    const id = document.getElementById('catalogRentBtn').dataset.veiculoId;
    const veiculo = getVeiculo(id);
    if (!veiculo) return;
    if (veiculo.status !== 'Disponível') {
      return toastWarn(`Este veículo está com status "${veiculo.status}" e não pode ser alugado agora.`);
    }
    openLocacaoModal(id);
  });
  document.getElementById('catalogDetailsBtn').addEventListener('click', () => {
    const id = document.getElementById('catalogDetailsBtn').dataset.veiculoId;
    abrirDetalheVeiculo(id);
  });

  window.addEventListener('resize', debounce(() => posicionarCoverflow(), 150));

  // Ações delegadas nas tabelas
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;

    switch (action) {
      case 'edit-veiculo': openVeiculoModal(getVeiculo(id)); break;
      case 'inativar-veiculo': inativarVeiculo(id); break;
      case 'reativar-veiculo': reativarVeiculo(id); break;
      case 'edit-cliente': openClienteModal(getCliente(id)); break;
      case 'inativar-cliente': inativarCliente(id); break;
      case 'reativar-cliente': reativarCliente(id); break;
      case 'devolucao': registrarDevolucao(id); break;
      case 'cancelar-locacao': cancelarLocacao(id); break;
      case 'excluir-locacao': excluirLocacao(id); break;
      case 'concluir-manutencao': concluirManutencao(id); break;
      case 'excluir-manutencao': excluirManutencao(id); break;
    }
  });

  // Teclado: ESC fecha modal aberto
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
    }
  });
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  bindEventos();
  carregarTudo();
  setInterval(carregarTudo, 60000);
});