/*
 * Calendario de Campanhas - Performance Supabase v1.0
 *
 * Camada SOMENTE DE LEITURA das tabelas:
 *   - performance_voucher
 *   - performance_situacao
 *   - performance_pagamento
 *   - performance_polo
 *   - performance_canal
 *
 * Reutiliza window.supabaseClient criado por supabase-adapter.js.
 * Este arquivo NAO contem Secret Key, service_role, INSERT, UPDATE ou DELETE.
 */
(function () {
  'use strict';

  const TABLES = Object.freeze({
    voucher: 'performance_voucher',
    situacao: 'performance_situacao',
    pagamento: 'performance_pagamento',
    polo: 'performance_polo',
    canal: 'performance_canal'
  });

  const state = {
    loading: false,
    error: null,
    filters: { voucherIds: [], ano: null, mes: null },
    voucher: [],
    situacao: [],
    pagamento: [],
    polo: [],
    canal: [],
    updatedAt: null
  };

  const realtimeChannels = [];
  let refreshTimer = null;
  let booted = false;

  function db() {
    return window.supabaseClient || null;
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeVoucherIds(value) {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    return [...new Set(list.map(v => String(v || '').trim().toUpperCase()).filter(Boolean))];
  }

  function normalizeFilters(filters) {
    const f = filters || {};
    const ano = f.ano === null || f.ano === undefined || f.ano === '' ? null : Number(f.ano);
    const mes = f.mes === null || f.mes === undefined || f.mes === '' ? null : Number(f.mes);

    if (ano !== null && (!Number.isInteger(ano) || ano < 2000 || ano > 2200)) {
      throw new Error('Ano de referencia invalido.');
    }
    if (mes !== null && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
      throw new Error('Mes de referencia invalido.');
    }

    return {
      voucherIds: normalizeVoucherIds(f.voucherIds || f.voucherId),
      ano,
      mes
    };
  }

  function applyFilters(query, filters) {
    let q = query;
    if (filters.voucherIds.length === 1) q = q.eq('voucher_id', filters.voucherIds[0]);
    if (filters.voucherIds.length > 1) q = q.in('voucher_id', filters.voucherIds);
    if (filters.ano !== null) q = q.eq('ano_referencia', filters.ano);
    if (filters.mes !== null) q = q.eq('mes_referencia', filters.mes);
    return q;
  }

  async function runQuery(table, select, filters, orderBy) {
    const client = db();
    if (!client) throw new Error('Supabase ainda nao foi inicializado.');

    let query = client.from(table).select(select);
    query = applyFilters(query, filters);

    (orderBy || []).forEach(item => {
      query = query.order(item.column, { ascending: item.ascending !== false });
    });

    const { data, error } = await query;
    if (error) throw new Error(table + ': ' + error.message);
    return data || [];
  }

  async function loadPerformanceVoucher(filters) {
    const f = normalizeFilters(filters || state.filters);
    return runQuery(
      TABLES.voucher,
      'id,voucher_id,data_referencia,ano_referencia,mes_referencia,qtd_utilizada,qtd_convertida,qtd_nao_convertida,receita_bruta,receita_liquida,data_atualizacao',
      f,
      [
        { column: 'voucher_id' },
        { column: 'data_referencia' }
      ]
    );
  }

  async function loadPerformanceSituacao(filters) {
    const f = normalizeFilters(filters || state.filters);
    return runQuery(
      TABLES.situacao,
      'id,voucher_id,ano_referencia,mes_referencia,situacao_matricula,criterio,qtd_matriculas,qtd_cpfs,valor_bruto,valor_liquido,data_atualizacao',
      f,
      [
        { column: 'voucher_id' },
        { column: 'criterio' },
        { column: 'situacao_matricula' }
      ]
    );
  }

  async function loadPerformancePagamento(filters) {
    const f = normalizeFilters(filters || state.filters);
    return runQuery(
      TABLES.pagamento,
      'id,voucher_id,ano_referencia,mes_referencia,situacao_matricula,meio_pagamento,qtd_matriculas,participacao,data_atualizacao',
      f,
      [
        { column: 'voucher_id' },
        { column: 'situacao_matricula' },
        { column: 'qtd_matriculas', ascending: false }
      ]
    );
  }

  async function loadPerformancePolo(filters) {
    const f = normalizeFilters(filters || state.filters);
    return runQuery(
      TABLES.polo,
      'id,voucher_id,ano_referencia,mes_referencia,polo_origem,qtd_matriculas,qtd_cpfs,data_atualizacao',
      f,
      [
        { column: 'qtd_matriculas', ascending: false },
        { column: 'polo_origem' }
      ]
    );
  }

  async function loadPerformanceCanal(filters) {
    const f = normalizeFilters(filters || state.filters);
    return runQuery(
      TABLES.canal,
      'id,voucher_id,ano_referencia,mes_referencia,canal_descida,qtd_matriculas,qtd_cpfs,valor_bruto,valor_liquido,data_atualizacao',
      f,
      [
        { column: 'qtd_matriculas', ascending: false },
        { column: 'canal_descida' }
      ]
    );
  }

  function sum(rows, field) {
    return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  }

  function aggregateVoucherRows(rows) {
    const map = new Map();

    rows.forEach(row => {
      const key = [row.voucher_id, row.ano_referencia, row.mes_referencia].join('|');
      if (!map.has(key)) {
        map.set(key, {
          voucher_id: row.voucher_id,
          ano_referencia: Number(row.ano_referencia),
          mes_referencia: Number(row.mes_referencia),
          qtd_utilizada: 0,
          qtd_convertida: 0,
          qtd_nao_convertida: 0,
          receita_bruta: 0,
          receita_liquida: 0,
          dias_com_movimento: 0,
          data_atualizacao: row.data_atualizacao || null
        });
      }

      const item = map.get(key);
      item.qtd_utilizada += Number(row.qtd_utilizada) || 0;
      item.qtd_convertida += Number(row.qtd_convertida) || 0;
      item.qtd_nao_convertida += Number(row.qtd_nao_convertida) || 0;
      item.receita_bruta += Number(row.receita_bruta) || 0;
      item.receita_liquida += Number(row.receita_liquida) || 0;
      item.dias_com_movimento += 1;
      if (row.data_atualizacao && (!item.data_atualizacao || row.data_atualizacao > item.data_atualizacao)) {
        item.data_atualizacao = row.data_atualizacao;
      }
    });

    return [...map.values()].map(item => ({
      ...item,
      percentual_conversao: item.qtd_utilizada > 0
        ? Number((item.qtd_convertida / item.qtd_utilizada * 100).toFixed(2))
        : 0
    }));
  }

  function paymentLeaders(rows) {
    const map = new Map();
    rows.forEach(row => {
      const key = [row.voucher_id, row.ano_referencia, row.mes_referencia, row.situacao_matricula].join('|');
      const current = map.get(key);
      if (!current || Number(row.qtd_matriculas) > Number(current.qtd_matriculas)) {
        map.set(key, row);
      }
    });
    return [...map.values()];
  }

  function buildSnapshot() {
    const resumoVoucher = aggregateVoucherRows(state.voucher);
    return {
      filters: clone(state.filters),
      updatedAt: state.updatedAt,
      voucher: clone(state.voucher),
      situacao: clone(state.situacao),
      pagamento: clone(state.pagamento),
      pagamentoMaisUtilizado: clone(paymentLeaders(state.pagamento)),
      polo: clone(state.polo),
      canal: clone(state.canal),
      resumoVoucher: clone(resumoVoucher),
      totais: {
        qtd_utilizada: sum(resumoVoucher, 'qtd_utilizada'),
        qtd_convertida: sum(resumoVoucher, 'qtd_convertida'),
        qtd_nao_convertida: sum(resumoVoucher, 'qtd_nao_convertida'),
        receita_bruta: sum(resumoVoucher, 'receita_bruta'),
        receita_liquida: sum(resumoVoucher, 'receita_liquida')
      }
    };
  }

  async function loadPerformanceCompleta(filters) {
    const f = normalizeFilters(filters || state.filters);
    state.loading = true;
    state.error = null;
    state.filters = f;
    emit('performance:loading', { filters: clone(f) });

    try {
      const [voucher, situacao, pagamento, polo, canal] = await Promise.all([
        loadPerformanceVoucher(f),
        loadPerformanceSituacao(f),
        loadPerformancePagamento(f),
        loadPerformancePolo(f),
        loadPerformanceCanal(f)
      ]);

      state.voucher = voucher;
      state.situacao = situacao;
      state.pagamento = pagamento;
      state.polo = polo;
      state.canal = canal;
      state.updatedAt = new Date().toISOString();
      state.loading = false;

      const snapshot = buildSnapshot();
      emit('performance:loaded', snapshot);
      return snapshot;
    } catch (error) {
      state.loading = false;
      state.error = error;
      console.error('[Performance] Falha ao carregar:', error);
      emit('performance:error', { message: error.message, error });
      throw error;
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      loadPerformanceCompleta(state.filters).catch(() => {});
    }, 350);
  }

  function startRealtime() {
    const client = db();
    if (!client || realtimeChannels.length) return;

    Object.values(TABLES).forEach(table => {
      const channel = client
        .channel('performance-' + table)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          scheduleRefresh
        )
        .subscribe(status => console.log('[Performance] Realtime', table, status));

      realtimeChannels.push(channel);
    });
  }

  async function stopRealtime() {
    const client = db();
    clearTimeout(refreshTimer);
    if (client) {
      await Promise.all(realtimeChannels.splice(0).map(channel => client.removeChannel(channel)));
    } else {
      realtimeChannels.length = 0;
    }
  }

  async function waitForClient() {
    for (let i = 0; i < 100; i += 1) {
      if (db()) return db();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Supabase nao foi inicializado por supabase-adapter.js.');
  }

  async function boot() {
    if (booted) return;
    booted = true;

    try {
      await waitForClient();
      startRealtime();
      emit('performance:ready', { tables: clone(TABLES) });
    } catch (error) {
      booted = false;
      state.error = error;
      console.error('[Performance] Inicializacao falhou:', error);
      emit('performance:error', { message: error.message, error });
    }
  }

  window.PerformanceSupabase = Object.freeze({
    tables: TABLES,
    loadVoucher: loadPerformanceVoucher,
    loadSituacao: loadPerformanceSituacao,
    loadPagamento: loadPerformancePagamento,
    loadPolo: loadPerformancePolo,
    loadCanal: loadPerformanceCanal,
    loadCompleta: loadPerformanceCompleta,
    getSnapshot: buildSnapshot,
    getState: () => ({
      loading: state.loading,
      error: state.error ? state.error.message : null,
      filters: clone(state.filters),
      updatedAt: state.updatedAt
    }),
    aggregateVoucherRows,
    paymentLeaders,
    startRealtime,
    stopRealtime,
    refresh: () => loadPerformanceCompleta(state.filters)
  });

  // Aliases simples para integracao gradual com o index.html.
  window.loadPerformanceVoucher = loadPerformanceVoucher;
  window.loadPerformanceSituacao = loadPerformanceSituacao;
  window.loadPerformancePagamento = loadPerformancePagamento;
  window.loadPerformancePolo = loadPerformancePolo;
  window.loadPerformanceCanal = loadPerformanceCanal;
  window.loadPerformanceCompleta = loadPerformanceCompleta;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
