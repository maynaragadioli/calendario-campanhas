/* =========================================================
   CONTEXTO DO MÊS - SUPABASE V3
   Persistência + múltiplos contextos + Realtime
   ========================================================= */

(function () {
  'use strict';

  let contextoEditandoId = null;
  let canalContextos = null;

  /* =========================================================
     SUPABASE
     ========================================================= */

  function db() {
    return window.supabaseClient;
  }


  /* =========================================================
     ADMIN
     ========================================================= */

  async function isAdmin() {

    const client = db();

    if (!client) {
      return false;
    }

    const { data, error } = await client.auth.getUser();

    if (error || !data?.user) {
      return false;
    }

    return (
      (data.user.email || '').toLowerCase() ===
      'maynara.gadioli@cogna.com.br'
    );
  }


  /* =========================================================
     CONVERTER REGISTRO DO SUPABASE PARA FORMATO DO CALENDÁRIO
     ========================================================= */

  function mapContexto(x) {

    return {
      id: Number(x.id),

      prod: x.produto,

      startDate: x.data_inicio,

      endDate: x.data_fim,

      obs: x.observacoes || '',

      obsType: x.tipo_observacao || 'info',

      discTitle: x.titulo_desconto || '',

      discAuto: !!x.desconto_automatico,

      items: Array.isArray(x.itens)
        ? x.itens
        : [],

      updatedBy: x.atualizado_por || '',

      updatedAt: x.atualizado_em || '',

      createdAt: x.criado_em || ''
    };
  }


  /* =========================================================
     CARREGAR TODOS OS CONTEXTOS
     ========================================================= */

  async function loadContextos() {

    const client = db();

    if (!client) {
      console.warn(
        '[Contextos] Cliente Supabase ainda não disponível.'
      );

      return;
    }

    const { data, error } = await client
      .from('contextos_mensais')
      .select('*')
      .order('data_inicio', {
        ascending: true
      })
      .order('id', {
        ascending: true
      });

    if (error) {

      console.error(
        '[Contextos] Erro ao consultar Supabase:',
        error
      );

      return;
    }

    console.log(
      '[Contextos] Registros carregados:',
      data
    );

    window.CTX_DATA =
      (data || []).map(mapContexto);

    try {

      CTX_DATA = window.CTX_DATA;

    } catch (e) {
      // variável pode já pertencer ao escopo global do index
    }

    const ids = window.CTX_DATA.map(
      x => Number(x.id) || 0
    );

    const nextId =
      Math.max(0, ...ids) + 1;

    try {

      CTX_NID = nextId;

    } catch (e) {
      // CTX_NID é legado do calendário
    }

    if (
      typeof renderCtxPanel === 'function'
    ) {

      renderCtxPanel();

    }

  }


  /* =========================================================
     DESATIVAR PERSISTÊNCIA ANTIGA EM LOCALSTORAGE
     ========================================================= */

  try {

    window.saveCtxData =
      saveCtxData =
      function () {

        console.log(
          '[Contextos] Persistência local ignorada. Fonte: Supabase.'
        );

      };

  } catch (e) {

    window.saveCtxData =
      function () {};

  }


  /* =========================================================
     COLETAR FORMULÁRIO
     ========================================================= */

  function montarPayload() {

    const inicio =
      document.getElementById('ctx-s')?.value;

    const fim =
      document.getElementById('ctx-e')?.value;

    if (!inicio || !fim) {

      toast(
        '⚠ Informe o período.',
        'warn'
      );

      return null;
    }

    if (inicio > fim) {

      toast(
        '⚠ Data fim anterior à Data início.',
        'warn'
      );

      return null;
    }

    const items =
      Array.from(
        document.querySelectorAll(
          '#ctx-rows .ctx-disc-row'
        )
      )
      .map(row => {

        const label =
          row.querySelector('.ctx-lbl');

        const pct =
          row.querySelector('.pct-in');

        return {
          label:
            label?.value?.trim() || '',

          pct:
            pct?.value?.trim() || ''
        };

      })
      .filter(x => x.label);

    return {

      produto:
        typeof ctxProd !== 'undefined'
          ? ctxProd
          : '',

      data_inicio:
        inicio,

      data_fim:
        fim,

      observacoes:
        document
          .getElementById('ctx-obs')
          ?.value
          ?.trim() || '',

      tipo_observacao:
        document
          .getElementById('ctx-ot')
          ?.value || 'info',

      titulo_desconto:
        document
          .getElementById('ctx-dt')
          ?.value
          ?.trim() || '',

      desconto_automatico:
        !!document
          .getElementById('ctx-auto')
          ?.checked,

      itens:
        items
    };

  }


  /* =========================================================
     NOVO CONTEXTO
     SEMPRE INSERT
     ========================================================= */

  async function inserirContexto(payload) {

    const client = db();

    const {
      data: usuario
    } =
      await client.auth.getUser();

    payload.atualizado_por =
      usuario?.user?.email || '';

    console.log(
      '[Contextos] INSERT:',
      payload
    );

    const {
      data,
      error
    } =
      await client
        .from('contextos_mensais')
        .insert(payload)
        .select();

    if (error) {

      console.error(
        '[Contextos] Erro no INSERT:',
        error
      );

      throw error;
    }

    if (!data || !data.length) {

      throw new Error(
        'O Supabase não retornou o contexto criado.'
      );

    }

    console.log(
      '[Contextos] INSERT confirmado:',
      data
    );

    return data[0];

  }


  /* =========================================================
     EDITAR CONTEXTO EXISTENTE
     UPDATE SOMENTE PELO ID
     ========================================================= */

  async function atualizarContexto(
    id,
    payload
  ) {

    const client = db();

    const {
      data: usuario
    } =
      await client.auth.getUser();

    payload.atualizado_por =
      usuario?.user?.email || '';

    console.log(
      '[Contextos] UPDATE ID:',
      id,
      payload
    );

    const {
      data,
      error
    } =
      await client
        .from('contextos_mensais')
        .update(payload)
        .eq('id', id)
        .select();

    if (error) {

      console.error(
        '[Contextos] Erro no UPDATE:',
        error
      );

      throw error
