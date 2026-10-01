/* Contexto do Mes - Supabase v2.1 */
(function () {
  'use strict';

  const ADMIN_EMAIL = 'maynara.gadioli@cogna.com.br';
  let editingId = null;
  let realtimeChannel = null;

  const db = () => window.supabaseClient;

  async function isAdmin() {
    const client = db();
    if (!client) return false;
    const { data, error } = await client.auth.getUser();
    return !error && (data?.user?.email || '').toLowerCase() === ADMIN_EMAIL;
  }

  function mapRow(x) {
    return {
      id: Number(x.id), prod: x.produto, startDate: x.data_inicio, endDate: x.data_fim,
      obs: x.observacoes || '', obsType: x.tipo_observacao || 'info',
      discTitle: x.titulo_desconto || '', discAuto: !!x.desconto_automatico,
      items: Array.isArray(x.itens) ? x.itens : [], updatedBy: x.atualizado_por || '',
      updatedAt: x.atualizado_em || '', createdAt: x.criado_em || ''
    };
  }

async function loadContextos() {

  const client = db();

  if (!client) {
    return;
  }

  const { data, error } = await client
    .from('contextos_mensais')
    .select('*')
    .order(
      'data_inicio'*
      { ascending: true }
    )
 *  .order(
      'id',
      { asce*ding: true }
    );

  if (error) *

    console.error(
      '[Contextos] SELECT falhou:',
      error
    );

    return;
  }

  const mapped =
    (data || []).map(mapRow);

  /*
   * Mantém CTX_DATA com todos os contextos.
   * O filtro do mês continua sendo realizado
   * pela função ctxInMonth() do index.html.
   */
  try {

    CTX_DATA = mapped;

  } catch (_) {

    window.CTX_DATA = mapped;

  }

  window.CTX_DATA = mapped;

  try {

    CTX_NID =
      Math.max(
        0,
        ...mapped.map(
          contexto =>
            Number(contexto.id) || 0
        )
      ) + 1;

  } catch (_) {
    // CTX_NID existe no index.html.
  }

  /*
   * Instala uma única vez a sincronização
   * entre o calendário e o painel de contexto.
   *
   * Sempre que render() for executada,
   * renderCtxPanel() também será executada.
   */
  if (
    !window.__contextoRenderSincronizado &&
    typeof window.render === 'function'
  ) {

    const renderCalendarioOriginal =
      window.render;

    window.render =
      function () {

        const resultado =
          renderCalendarioOriginal.apply(
            this,
            arguments
          );

        if (
          typeof window.renderCtxPanel ===
          'function'
        ) {

          window.renderCtxPanel();

        } else if (
          typeof renderCtxPanel ===
          'function'
        ) {

          renderCtxPanel();

        }

        return resultado;

      };

    window.__contextoRenderSincronizado =
      true;

    console.log(
      '[Contextos] Sincronização com o mês do calendário instalada.'
    );
  }

  /*
   * Renderiza imediatamente depois
   * de carregar os dados do Supabase.
   */
  if (
    typeof window.renderCtxPanel ===
    'function'
  ) {

    window.renderCtxPanel();

  } else if (
    typeof renderCtxPanel ===
    'function'
  ) {

    renderCtxPanel();

  }

  console.log(
    '[Contextos] carregados:',
    mapped.length,
    '| mês visualizado:',
    typeof viewMonth !== 'undefined'
      ? viewMonth + 1
      : 'indisponível',
    '| ano visualizado:',
    typeof viewYear !== 'undefined'
      ? viewYear
      : 'indisponível'
  );
}

  // Desliga somente a persistencia local antiga do contexto.
  try { saveCtxData = function () {}; } catch (_) {}
  window.saveCtxData = function () {};

  function formPayload() {
    const inicio = document.getElementById('ctx-s')?.value || '';
    const fim = document.getElementById('ctx-e')?.value || '';
    if (!inicio || !fim) throw new Error('Informe o periodo.');
    if (inicio > fim) throw new Error('Data fim anterior a Data inicio.');

    const items = Array.from(document.querySelectorAll('#ctx-rows .ctx-disc-row')).map(row => ({
      label: row.querySelector('.ctx-lbl')?.value?.trim() || '',
      pct: row.querySelector('.pct-in')?.value?.trim() || ''
    })).filter(x => x.label);

    return {
      produto: (typeof ctxProd !== 'undefined' ? ctxProd : ''),
      data_inicio: inicio,
      data_fim: fim,
      observacoes: document.getElementById('ctx-obs')?.value?.trim() || '',
      tipo_observacao: document.getElementById('ctx-ot')?.value || 'info',
      titulo_desconto: document.getElementById('ctx-dt')?.value?.trim() || '',
      desconto_automatico: !!document.getElementById('ctx-auto')?.checked,
      itens: items
    };
  }

  async function save() {
    if (!(await isAdmin())) {
      toast('Apenas Administradores.', 'warn');
      return;
    }
    const client = db();
    if (!client) return toast('Supabase indisponivel.', 'err');

    try {
      const payload = formPayload();
      const { data: authData } = await client.auth.getUser();
      payload.atualizado_por = authData?.user?.email || '';

      let result;
      if (editingId !== null) {
        result = await client.from('contextos_mensais').update(payload).eq('id', editingId).select();
      } else {
        // Novo contexto SEMPRE cria nova linha. Permite varios contextos no mesmo mes/produto.
        result = await client.from('contextos_mensais').insert(payload).select();
      }

      if (result.error) throw result.error;
      if (!result.data?.length) throw new Error('O Supabase nao confirmou a gravacao.');

      editingId = null;
      await loadContextos();
      if (typeof closeCtxDrawer === 'function') closeCtxDrawer();
      toast('Contexto salvo no Supabase!', 'ok');
    } catch (error) {
      console.error('[Contextos] SAVE falhou:', error);
      toast('Erro ao salvar contexto: ' + (error?.message || 'erro desconhecido'), 'err');
    }
  }

  window.saveCtxEntry = save;
  try { saveCtxEntry = save; } catch (_) {}

  window.editarContextoSupabase = function (id) {
    editingId = Number(id);
    return (window.CTX_DATA || []).find(x => Number(x.id) === editingId) || null;
  };

  window.novoContextoSupabase = function () { editingId = null; };
  window.cancelarEdicaoContexto = function () { editingId = null; };

  window.excluirContextoSupabase = async function (id) {
    if (!(await isAdmin())) return toast('Apenas Administradores.', 'warn');
    const { data, error } = await db().from('contextos_mensais').delete().eq('id', Number(id)).select();
    if (error) {
      console.error('[Contextos] DELETE falhou:', error);
      return toast('Erro ao excluir: ' + error.message, 'err');
    }
    editingId = null;
    await loadContextos();
    toast(data?.length ? 'Contexto removido.' : 'Nenhum contexto removido.', 'warn');
  };

  // Nunca remove por mes/produto. Exige ID explicitamente selecionado.
  window.deleteCtxEntry = async function () {
    if (editingId === null) return toast('Selecione um contexto especifico para excluir.', 'warn');
    return window.excluirContextoSupabase(editingId);
  };
  try { deleteCtxEntry = window.deleteCtxEntry; } catch (_) {}

  function startRealtime() {
    const client = db();
    if (!client) return;
    realtimeChannel = client.channel('contextos-mensais-v21')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contextos_mensais' }, loadContextos)
      .subscribe(status => console.log('[Contextos] Realtime:', status));
  }

  async function boot() {
    for (let i = 0; i < 50 && !db(); i++) await new Promise(resolve => setTimeout(resolve, 100));
    if (!db()) return console.error('[Contextos] Supabase nao inicializado.');
    await loadContextos();
    startRealtime();
  }

  window.reloadContextosSupabase = loadContextos;
  setTimeout(boot, 0);
})();
