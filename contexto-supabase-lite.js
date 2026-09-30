/* Contexto Mensal compartilhado - versao leve
   Carregar depois de supabase-adapter.js
*/
(function(){
  'use strict';
  const getDb=()=>window.supabaseClient;
  const admin=()=>typeof CUR!=='undefined'&&CUR.role==='Admin';

  function mapCtx(x){return{id:Number(x.id),prod:x.produto,startDate:x.data_inicio,endDate:x.data_fim,obs:x.observacoes||'',obsType:x.tipo_observacao||'info',discTitle:x.titulo_desconto||'',discAuto:!!x.desconto_automatico,items:Array.isArray(x.itens)?x.itens:[],updatedBy:x.atualizado_por||'',updatedAt:x.atualizado_em||''};}

  async function reloadCtx(){
    const db=getDb(); if(!db)return;
    const {data,error}=await db.from('contextos_mensais').select('*').order('data_inicio').order('id');
    if(error){console.error('Contexto Supabase:',error);return;}
    CTX_DATA=(data||[]).map(mapCtx);
    CTX_NID=Math.max(0,...CTX_DATA.map(x=>x.id||0))+1;
    renderCtxPanel();
  }

  // Impede que o contexto continue usando localStorage como fonte de dados.
  saveCtxData=function(){};

  saveCtxEntry=async function(){
    if(!admin()){toast('🔒 Apenas Administradores.','warn');return;}
    const db=getDb(); if(!db){toast('❌ Supabase indisponível.','err');return;}
    const s=document.getElementById('ctx-s').value,e=document.getElementById('ctx-e').value;
    if(!s||!e){toast('⚠ Informe o período.','warn');return;}
    if(s>e){toast('⚠ Data fim anterior à Data início.','warn');return;}
    const items=Array.from(document.querySelectorAll('#ctx-rows .ctx-disc-row')).map(r=>({label:r.querySelector('.ctx-lbl').value.trim(),pct:r.querySelector('.pct-in').value.trim()})).filter(x=>x.label);
    const existing=CTX_DATA.filter(x=>x.prod===ctxProd&&x.endDate>=s&&x.startDate<=e).map(x=>x.id);
    if(existing.length){const del=await db.from('contextos_mensais').delete().in('id',existing);if(del.error){toast('❌ '+del.error.message,'err');return;}}
    const {error}=await db.from('contextos_mensais').insert({produto:ctxProd,data_inicio:s,data_fim:e,observacoes:document.getElementById('ctx-obs').value.trim(),tipo_observacao:document.getElementById('ctx-ot').value,titulo_desconto:document.getElementById('ctx-dt').value.trim(),desconto_automatico:document.getElementById('ctx-auto').checked,itens,atualizado_por:CUR.email||CUR.name});
    if(error){toast('❌ Erro ao salvar contexto: '+error.message,'err');return;}
    closeCtxDrawer();await reloadCtx();toast('✅ Contexto salvo na base compartilhada!','ok');
  };

  deleteCtxEntry=async function(){
    if(!admin()){toast('🔒 Apenas Administradores.','warn');return;}
    const ids=CTX_DATA.filter(x=>x.prod===ctxProd&&ctxInMonth(x,viewYear,viewMonth)).map(x=>x.id);
    if(!ids.length)return;
    const {error}=await getDb().from('contextos_mensais').delete().in('id',ids);
    if(error){toast('❌ '+error.message,'err');return;}
    closeCtxDrawer();await reloadCtx();toast('🗑️ Contexto removido.','warn');
  };

  async function boot(){
    for(let i=0;i<50&&!getDb();i++)await new Promise(r=>setTimeout(r,100));
    const db=getDb();if(!db)return;
    await reloadCtx();
    db.channel('contextos-mensais-ui').on('postgres_changes',{event:'*',schema:'public',table:'contextos_mensais'},reloadCtx).subscribe();
  }
  setTimeout(boot,0);
})();
