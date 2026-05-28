window.addEventListener('DOMContentLoaded', async () => {
  const btnPing = document.getElementById('btn-ping') as HTMLButtonElement;
  const btnLog = document.getElementById('btn-log') as HTMLButtonElement;
  const btnConfig = document.getElementById('btn-config') as HTMLButtonElement;
  const out = document.getElementById('output') as HTMLPreElement;

  btnPing.onclick = async () => {
    const resp = await rpc('test-provider', 'ping', {});
    out.textContent = `🔄 Ping response: ${resp.result}`;
  };

  btnLog.onclick = async () => {
    const resp = await rpc('control-provider', 'log-info', { message: 'Sidecar test log entry' });
    out.textContent = `🗒️ ${resp.result}`;
  };

  btnConfig.onclick = async () => {
    const resp = await rpc('config-provider', 'get-config', {});
    out.textContent = `⚙️ Config payload:\n${JSON.stringify(resp, null, 2)}`;
  };
});