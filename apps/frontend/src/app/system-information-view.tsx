import type { AppRole, OperationalMetrics, RuntimeIdentity, SystemInfo } from "@niedax/domain";
import {
  formatSystemInformation,
  showOperationalMetrics,
  showTestBadge
} from "../lib/system-information";

export function SystemInformationView({
  identity,
  system,
  role,
  language,
  errorReference,
  error,
  metrics,
  onLoadMetrics
}: Readonly<{
  identity: RuntimeIdentity;
  system: SystemInfo | null;
  role: AppRole | null;
  language: "bg" | "en";
  errorReference: string | null;
  error: boolean;
  metrics: OperationalMetrics | null;
  onLoadMetrics: () => void;
}>) {
  const bg = language === "bg";
  return (
    <div className="system-information">
      {showTestBadge(identity) ? (
        <strong className="test-environment-badge" aria-label="TEST environment">
          TEST
        </strong>
      ) : null}
      <details>
        <summary>{bg ? "Системна информация" : "System information"}</summary>
        <div className="system-information-panel">
          <label>
            {bg
              ? "Изберете текста за копиране към доклада за дефект"
              : "Select the text to copy into a defect report"}
            <textarea
              aria-label={bg ? "Системна информация за копиране" : "System information to copy"}
              readOnly
              rows={system ? 11 : 5}
              value={formatSystemInformation(identity, system)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          {!role ? (
            <p>
              {bg
                ? "Влезте за активните версии на каталога и правилата."
                : "Sign in to see active catalog and rule versions."}
            </p>
          ) : null}
          {error ? (
            <p role="alert">
              {bg ? "Информацията не е достъпна." : "Information is unavailable."}
              {errorReference ? (
                <>
                  {" "}
                  {bg ? "Код за поддръжка" : "Support correlation ID"}:{" "}
                  <code>{errorReference}</code>
                </>
              ) : null}
            </p>
          ) : null}
          {showOperationalMetrics(identity, role) ? (
            <>
              <button type="button" className="secondary-button" onClick={onLoadMetrics}>
                {bg ? "Обнови оперативните показатели" : "Refresh operational metrics"}
              </button>
              {metrics ? (
                <dl className="operational-metrics">
                  <dt>{bg ? "Работа (секунди)" : "Uptime (seconds)"}</dt>
                  <dd>{Math.floor(metrics.uptimeSeconds)}</dd>
                  <dt>{bg ? "HTTP заявки" : "HTTP requests"}</dt>
                  <dd>{metrics.requestCount}</dd>
                  <dt>{bg ? "Сървърни грешки" : "Server errors"}</dt>
                  <dd>{metrics.serverErrorCount}</dd>
                  <dt>{bg ? "Критични грешки" : "Critical errors"}</dt>
                  <dd>{metrics.criticalApplicationErrorCount}</dd>
                  <dt>
                    {bg ? "Грешки при възстановяване на експорта" : "Export recovery failures"}
                  </dt>
                  <dd>{metrics.exportWorkerFailureCount}</dd>
                  <dt>{bg ? "База данни" : "Database readiness"}</dt>
                  <dd>{metrics.databaseReadiness}</dd>
                </dl>
              ) : null}
            </>
          ) : null}
        </div>
      </details>
    </div>
  );
}
