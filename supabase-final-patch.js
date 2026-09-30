/* Calendario de Campanhas - ajustes finais v1
   Carregar DEPOIS de supabase-adapter.js
*/
(function () {
  'use strict';

  const ADMIN_EMAIL = 'maynara.gadioli@cogna.com.br';
  let ctxChannel = null;
  let domObserver = null;

  const db = () => window.supabaseClient;
  const isAdmin = () => typeof CUR !== 'undefined' && CUR.role === 'Admin';

  function cleanLegacyUI() {
    const login = document.getElementById('a-pin');
    if (login) login.textContent = '🔐 Entrar';
    const src = document.getElementById('um-src');
    if (src) src.textContent = 'via Supabase';
    const legend = document.getElementById('leg-perm');
    if (legend) legend.textContent = '☁️ Supabase · ' + ((typeof CUR !== 'undefined' && CUR.role) || 'Visualizador');
    const hint = document.getElementById('savehint');
    if (hint && /Dados salvos|localStorage|sessionStorage|memory/i.test(hint.textContent)) hint.textContent = '☁️ Base compartilhada';
    document.querySelectorAll('.empty-month div').forEach(el => {
      if (/PIN/i.test(el.textContent)) el.textContent = 'Entre para cadastrar a primeira campanha';
    });
    const tech = Array.from(document.querySelectorAll('.legi')).find(el => /Storage híbrido/i.test(el.textContent));
    if (tech) tech.textContent = '☁️ Base centralizada · ⚡ Realtime · 🛡️ RLS';
    const pinModal = document.getElementById('ov-pin');
    if (pinModal) pinModal.style.display = 'none';
  }

  function wrapLegacyFunctions() {
    if (typeof applyUI === 'function' && !applyUI.__finalWrapped) {
      const oldApplyUI = applyUI;
      applyUI = function () { oldApplyUI(); cleanLegacyUI(); };
      applyUI.__finalWrapped = true;
    }
    if (typeof render === 'function' && !render.__finalWrapped) {
      const oldRender = render;
      render = function () { oldRender(); cleanLegacyUI(); };
      render.__finalWrapped = true;
    }
    if (typeof openDrawer === 'function' && !openDrawer.__finalWrapped) {
      const oldOpenDrawer = openDrawer;
      openDrawer = function (id, pre) {
        oldOpenDrawer(id, pre);
        const del = document.getElementById('del-btn');
        if (del && !isAdmin()) del.style.display = 'none';
      };
      openDrawer.__finalWrapped = true;
    }

    // Status e contexto deixam de gravar dados de negocio no storage local.
    autoStatus = function () {
      CAMPS.forEach(c => {
        if (c.status === 'Inativa' || c.status === 'Não informado' || !c.s || !c.e) return;
        c.status = nd(c.e) < TODAY ? 'Encerrada' : nd(c.s) > TODAY ? 'Futura' : 'Ativo';
      });
    };
    loadCtx = function () { CTX_DATA = []; CTX_NID = 1; };
    saveCtxData = function () {};
  }

  window.openPerm = function () {
    if (!isAdmin()) { toast('🔒 Apenas Administradores.', 'warn'); return; }
    const modal = document.getElementById('ov-perm');
    const title = modal?.querySelector('.mtitle');
    if (title) title.textContent = '🔐 Acessos do Calendário';
    document.getElementById('perm-sub').textContent = 'Autenticação e autorização via Supabase';
    document.getElementById('perm-body').innerHTML = `
      <div class="pmsync pmok">✅ Supabase Auth conectado</div>
      <div class="ucrd"><div class="ucav" style="background:${CUR.color}">${CUR.initials}</div>
      <div><div style="font-size:14px;font-weight:700">${escH(CUR.name)}</div>
      <div style="font-size:11.5px;color:var(--t3)">${escH(CUR.email || '')}</div>
      <div style="margin-top:4px"><span class="r-chip rc-adm">${escH(CUR.role)}</span></div></div></div>
      <table class="pmtbl"><thead><tr><th>Perfil</th><th>Permissões</th></tr></thead><tbody>
      <tr><td><span class="gbadge gbo">👑 Admin</span></td><td>Visualizar, importar, criar, editar, excluir e gerenciar contexto</td></tr>
      <tr><td><span class="gbadge gbm">✏️ Editor</span></td><td>Visualizar, importar, criar e editar campanhas</td></tr>
      <tr><td><span class="gbadge gbv">👁️ Visualizador</span></td><td>Somente leitura e exportação</td></tr>
      </tbody></table>
      <div style="background:var(--n1);border-radius:var(--rsm);padding:10px 14px;font-size:12px;color:var(--t3);line-height:1.6">
      Contas são administradas no Supabase Authentication. As regras de segurança são aplicadas no banco por RLS.</div>`;
    document.getElementById('perm-foot').textContent = 'Base compartilhada · Supabase Auth · RLS';
    modal.classList.add('open');
  };

  function fromContextDb(x) {
    return { id:Number(x.id), prod:x.produto, startDate:x.data_inicio, endDate:x.data_fim,
      obs:x.observacoes || '', obsType:x.tipo_observacao || 'info', discTitle:x.titulo_desconto || '',
      discAuto:Boolean(x.desconto_automatico), items:Array.isArray(x.itens) ? x.itens : [],
      updatedBy:x.atualizado_por || '', updatedAt:x.atualizado_em || '' };
  }

  async function loadContexts(silent) {
    const client = db(); if (!client) return;
    const { data, error } = await client.from('contextos_mensais').select('*').order('data_inicio').order('id');
    if (error) { if (!silent) toast('Erro ao carregar contexto: ' + error.message, 'err'); return; }
    CTX_DATA = (data || []).map(fromContextDb);
    CTX_NID = Math.max(0, ...CTX_DATA.map(x => Number(x.id) || 0)) + 1;
    renderCtxPanel(); cleanLegacyUI();
  }

  window.saveCtxEntry = async function () {
    if (!isAdmin()) { toast('🔒 Apenas Administradores.', 'warn'); return; }
    const s = document.getElementById('ctx-s').value, e = document.getElementById('ctx-e').value;
    if (!s || !e) { toast('⚠ Informe o período.', 'warn'); return; }
    if (s > e) { toast('⚠ Data fim anterior à data início.', 'warn'); return; }
    const items = Array.from(document.querySelectorAll('#ctx-rows .ctx-disc-row')).map(row => ({
      label:row.querySelector('.ctx-lbl').value.trim(), pct:row.querySelector('.pct-in').value.trim()
    })).filter(x => x.label);
    const ids = CTX_DATA.filter(x => x.prod === ctxProd && x.endDate >= s && x.startDate <= e).map(x => x.id);
    if (ids.length) {
      const removed = await db().from('contextos_mensais').delete().in('id', ids);
      if (removed.error) { toast('Erro ao substituir contexto: ' + removed.error.message, 'err'); return; }
    }
    const { error } = await db().from('contextos_mensais').insert({
      produto:ctxProd, data_inicio:s, data_fim:e,
      observacoes:document.getElementById('ctx-obs').value.trim(),
      tipo_observacao:document.getElementById('ctx-ot').value,
      titulo_desconto:document.getElementById('ctx-dt').value.trim(),
      desconto_automatico:document.getElementById('ctx-auto').checked,
      itens, atualizado_por:CUR.email || CUR.name
    });
    if (error) { toast('Erro ao salvar contexto: ' + error.message, 'err'); return; }
    closeCtxDrawer(); await loadContexts(true); toast('✅ Contexto salvo na base compartilhada!', 'ok');
  };

  window.deleteCtxEntry = async function () {
    if (!isAdmin()) { toast('🔒 Apenas Administradores.', 'warn'); return; }
    const ids = CTX_DATA.filter(x => x.prod === ctxProd && ctxInMonth(x, viewYear, viewMonth)).map(x => x.id);
    if (!ids.length) return;
    const { error } = await db().from('contextos_mensais').delete().in('id', ids);
    if (error) { toast('Erro ao remover contexto: ' + error.message, 'err'); return; }
    closeCtxDrawer(); await loadContexts(true); toast('🗑️ Contexto removido.', 'warn');
  };

  // Corrige a detecção de colunas do XLSX, inclusive posição zero.
  parseAoA = function (data) {
    if (!data || data.length < 2) return [];
    const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const hdr = data[0].map(norm);
    const find = (...keys) => { for (const k of keys) { const i=hdr.findIndex(h=>h.includes(norm(k))); if(i>=0)return i; } return -1; };
    const c={name:find('campanha','acao','nome'),prod:find('produto','categoria'),disc:find('desconto','disc','%'),
      stat:find('status'),start:find('data inicio','inicio','start'),end:find('data fim','fim','termino','end'),
      code:find('voucher','codigo','code'),approx:find('aproxim'),obs:find('observ','nota')};
    const get=(r,i)=>i>=0?String(r[i]??'').trim():'';
    return data.slice(1).map((r,i)=>rowToObj(get(r,c.name),get(r,c.prod),get(r,c.disc),get(r,c.stat),get(r,c.start),get(r,c.end),get(r,c.code),get(r,c.approx),get(r,c.obs),i)).filter(x=>x.name&&x.prod);
  };

  async function bootFinalPatch() {
    wrapLegacyFunctions(); cleanLegacyUI();
    for (let i=0; i<50 && !db(); i++) await new Promise(r=>setTimeout(r,100));
    if (!db()) { console.error('Supabase client não disponível para ajustes finais.'); return; }
    await loadContexts(true);
    ctxChannel = db().channel('contextos-compartilhados')
      .on('postgres_changes',{event:'*',schema:'public',table:'contextos_mensais'},()=>loadContexts(true)).subscribe();
    domObserver = new MutationObserver(cleanLegacyUI);
    domObserver.observe(document.body,{childList:true,subtree:true});
    cleanLegacyUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bootFinalPatch,0));
  else setTimeout(bootFinalPatch,0);
})();
