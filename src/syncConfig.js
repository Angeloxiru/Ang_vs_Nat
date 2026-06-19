// =====================================================================
// Configuração de sincronização com o Google Sheets (Apps Script).
//
// Deixe `url` vazio para rodar 100% offline (apenas localStorage).
// Após criar o Web App (ver google-apps-script/Code.gs), cole aqui a URL
// que termina em /exec e o mesmo SECRET do script. Faça commit + redeploy
// para que TODOS os dispositivos (Nat, Ang, Admin) usem a mesma planilha.
// =====================================================================

export const syncConfig = {
  url: 'https://script.google.com/macros/s/AKfycbxDV5BhMXW93NHrK5zk6d3rvTR429TmqMZ-8fnhraV_ld0JSpO5NDlxKUp8TWu76-VLOQ/exec', // ex: 'https://script.google.com/macros/s/AKfy.../exec'
  secret: 'AMSL' // mesmo valor de SECRET no Code.gs (pode ficar vazio)
}

export const syncEnabled = () => Boolean(syncConfig.url)
