/**
 * Avisa o processador de vídeos que há trabalho na fila.
 * No Google Cloud, executa o Cloud Run Job (CLOUD_RUN_JOB, PROJETO_GCP, REGIAO).
 * Localmente não faz nada: o worker em loop pega o vídeo sozinho.
 */
export async function dispararProcessador(): Promise<void> {
  const job = process.env.CLOUD_RUN_JOB;
  const projeto = process.env.PROJETO_GCP;
  const regiao = process.env.REGIAO;
  if (!job || !projeto || !regiao) return;
  try {
    // Token da conta de serviço do próprio Cloud Run (servidor de metadados).
    const t = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
      headers: { "Metadata-Flavor": "Google" },
    });
    const { access_token } = (await t.json()) as { access_token: string };
    const r = await fetch(`https://run.googleapis.com/v2/projects/${projeto}/locations/${regiao}/jobs/${job}:run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) console.error("Falha ao disparar processador:", r.status, await r.text());
  } catch (e) {
    // O agendador de segurança (Cloud Scheduler) roda o job de tempos em tempos.
    console.error("Falha ao disparar processador:", e);
  }
}
