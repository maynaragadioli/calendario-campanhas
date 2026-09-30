/* Calendario de Campanhas - adaptador Supabase v1
   Coloque este arquivo no mesmo diretorio do index.html e carregue-o depois do script principal.
*/
(function () {
  'use strict';

  const SUPABASE_URL = 'https://jekfvnhloxwgrenlttss.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_X3BumXYkxg5H4xVZEJUQ3A_Um9d9IyH';
  const ADMIN_EMAILS = ['maynara.gadioli@cogna.com.br'];
  let db = null;
  let realtimeChannel = null;

  function setHint(text) {
    const el = document.getElementById('savehint');
    if (el) el.textContent = text;
  }

  function fromDb(x) {
    return {
      id: Number(x.id),
      name: x.nome || '',
      prod: x.produto || '',
      disc: Number(x.desconto) || 0,
      status: x.status || 'Não informado',
      s: x.data_inicio || '',
      e: x.data_fim || '',
      code: x.codigo_voucher || '',
      approx: Boolean(x.inicio_aproximado),
      obs: x.observacoes || '',
      color: x.cor || '#5c2d91',
      createdBy: x.criado_por || '',
      updatedBy: x.atualizado_por || '',
      createdAt: x.criado_em || '',
      updatedAt: x.atualizado_em || ''
    };
  }

  function toDb(c, isNew) {
    const row = {
      nome: c.name,
      produto: c.prod,
      desconto: Number(c.disc) || 0,
      status: c.status,
      data_inicio: c.s,
      data_fim: c.e,
      codigo_voucher: c.code || '',
      inicio_aproximado: Boolean(c.approx),
      observacoes: c.obs || '',
      cor: c.color || '#5c2d91',
      atualizado_por: (typeof CUR !== 'undefined' && (CUR.email || CUR.name)) || ''
    };
    if (isNew) row.criado_por = row.atualizado_por;
    return row;
  }

  async function refreshCampaigns(silent) {
    if (!db) return;
    if (!silent) setHint('☁️ Sincronizando...');
    const { data, error } = await db
      .from('campanhas')
      .select('*')
      .order('data_inicio', { ascending: true })
      .order('id', { ascending: true });
    if (error) {
      console.error(error);
      setHint('⚠️ Falha na sincronização');
      if (!silent && window.toast) toast('Erro ao carregar campanhas: ' + error.message, 'err');
      return;
    }
    CAMPS = (data || []).map(fromDb);
    nextId = Math.max(0, ...CAMPS.map(c => Number(c.id) || 0)) + 1;
    if (window.iC) iC();
    if (window.rebuildIndex) rebuildIndex();
    if (window.autoStatus) autoStatus();
    if (window.render) render();
    setHint('☁️ ' + CAMPS.length + ' campanha(s) sincronizada(s)');
  }

  async function applySession(session) {
    if (session && session.user) {
      const email = (session.user.email || '').toLowerCase();
      const name = session.user.user_metadata?.name || email.split('@')[0] || 'Usuário';
      const role = ADMIN_EMAILS.includes(email) ? 'Admin' : 'Editor';
      CUR = {
        name,
        email,
        login: email,
        initials: typeof getInit === 'function' ? getInit(name) : name.substring(0, 2).toUpperCase(),
        color: '#5c2d91',
        role,
        src: 'supabase'
      };
      if (window.updChip) updChip();
      if (window.applyUI) applyUI();
      if (window.showAuth) showAuth('ok', 'ad-ok', '✅ ' + email + ' · ' + role, 'Conectado ao Supabase', role === 'Admin', false);
    } else {
      CUR = {name:'Visitante',email:'',login:'',initials:'?',color:'#888',role:'Visualizador',src:'supabase'};
      if (window.updChip) updChip();
      if (window.applyUI) applyUI();
      if (window.showAuth) showAuth('warn', 'ad-warn', '☁️ Base compartilhada', 'Entre para criar ou editar campanhas.', false, true);
      const loginLink = document.getElementById('a-pin');
      if (loginLink) loginLink.textContent = '🔐 Entrar';
    }
  }

  window.openPinModal = async function () {
    const email = prompt('E-mail de acesso ao calendário:', 'maynara.gadioli@cogna.com.br');
    if (!email) return;
    const password = prompt('Senha da conta criada no Supabase:');
    if (!password) return;
    setHint('🔐 Autenticando...');
    const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setHint('⚠️ Falha no login');
      if (window.toast) toast('Não foi possível entrar: ' + error.message, 'err');
      return;
    }
    await applySession(data.session);
    await refreshCampaigns();
    if (window.toast) toast('✅ Login realizado.', 'ok');
  };

  window.execLogout = async function () {
    await db.auth.signOut();
    const ov = document.getElementById('ov-logout');
    if (ov) ov.classList.remove('open');
    await applySession(null);
    if (window.toast) toast('🚪 Sessão encerrada.', '');
  };

  window.saveCamp = async function () {
    if (!window.validate || !validate()) return;
    if (typeof canEdit !== 'function' || !canEdit()) {
      if (window.toast) toast('🔒 Entre para salvar campanhas.', 'warn');
      return;
    }
    const item = {
      name: document.getElementById('f-name').value.trim(),
      prod: document.getElementById('f-prod').value,
      disc: Number(document.getElementById('f-disc').value),
      status: document.getElementById('f-stat').value,
      s: document.getElementById('f-start').value,
      e: document.getElementById('f-end').value,
      approx: document.getElementById('f-approx').checked,
      code: document.getElementById('f-code').value.trim().toUpperCase(),
      obs: document.getElementById('f-obs').value.trim(),
      color: typeof selClr !== 'undefined' ? selClr : '#5c2d91'
    };
    setHint('☁️ Salvando...');
    let result;
    const wasEditing = typeof editId !== 'undefined' && Boolean(editId);
    if (wasEditing) {
      result = await db.from('campanhas').update(toDb(item, false)).eq('id', editId);
    } else {
      result = await db.from('campanhas').insert(toDb(item, true));
    }
    if (result.error) {
      console.error(result.error);
      setHint('⚠️ Erro ao salvar');
      if (window.toast) toast('Erro ao salvar: ' + result.error.message, 'err');
      return;
    }
    if (window.closeDrawer) closeDrawer();
    await refreshCampaigns();
    if (window.toast) toast(wasEditing ? '✅ Campanha atualizada!' : '✅ Campanha adicionada!', 'ok');
  };

  window.execDel = async function () {
    if (typeof canEdit !== 'function' || !canEdit() || typeof editId === 'undefined' || !editId) return;
    setHint('☁️ Excluindo...');
    const { error } = await db.from('campanhas').delete().eq('id', editId);
    if (error) {
      console.error(error);
      setHint('⚠️ Erro ao excluir');
      if (window.toast) toast('Erro ao excluir: ' + error.message, 'err');
      return;
    }
    const ov = document.getElementById('ov-del');
    if (ov) ov.classList.remove('open');
    if (window.closeDrawer) closeDrawer();
    await refreshCampaigns();
    if (window.toast) toast('🗑️ Campanha excluída.', 'warn');
  };

  window.doImp = async function (mode) {
    if (typeof canEdit !== 'function' || !canEdit()) return;
    const valid = (typeof pImp !== 'undefined' ? pImp : []).filter(c => window.valRow && valRow(c).length === 0);
    if (!valid.length) {
      if (window.toast) toast('⚠ Nenhum registro válido.', 'warn');
      return;
    }
    setHint('☁️ Importando...');
    if (mode === 'replace') {
      const del = await db.from('campanhas').delete().gt('id', 0);
      if (del.error) {
        if (window.toast) toast('Erro ao limpar a base: ' + del.error.message, 'err');
        return;
      }
    }
    const rows = valid.map(c => toDb(c, true));
    const { error } = await db.from('campanhas').insert(rows);
    if (error) {
      console.error(error);
      if (window.toast) toast('Erro na importação: ' + error.message, 'err');
      return;
    }
    const ov = document.getElementById('ov-imp');
    if (ov) ov.classList.remove('open');
    pImp = [];
    await refreshCampaigns();
    if (window.toast) toast('✅ ' + valid.length + ' campanha(s) importada(s)!', 'ok');
  };

  async function start() {
    if (!window.supabase || !window.supabase.createClient) {
      setHint('⚠️ Biblioteca Supabase não carregada');
      return;
    }
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.supabaseClient = db;
    setHint('☁️ Conectando ao Supabase...');
    const { data } = await db.auth.getSession();
    await applySession(data.session);
    await refreshCampaigns();

    db.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => applySession(session), 0);
    });

    realtimeChannel = db
      .channel('campanhas-compartilhadas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campanhas' }, () => refreshCampaigns(true))
      .subscribe();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
