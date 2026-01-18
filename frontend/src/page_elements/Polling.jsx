import { useEffect, useRef } from "react";
import { api } from "../api/endpoints";

// Универсальный polling для UploadPage: опрашивает весь список документов, пока есть "processing"
export function usePollingDocumentStatus({
  docs,
  setDocs,
  intervalMs = 3000,
  maxTries = 50,
}) {
  const intervalRef = useRef(null);
  const triesRef = useRef(0);

  useEffect(() => {
    // Добавлена проверка что docs это массив
    if (!Array.isArray(docs)) {
      return;
    }

    const hasProcessing = docs.some(
      (doc) => doc.status === "processing" && doc.id && !doc.temp
    );

    // Если есть хотя бы один "processing" — запускаем polling
    if (hasProcessing) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(async () => {
          triesRef.current += 1;
          try {
            const { data } = await api.get("/documents/", { withCredentials: true });
            // Проверяем что data.results это массив
            if (Array.isArray(data.results)) {
              setDocs(data.results);
            } else if (Array.isArray(data)) {
              setDocs(data);
            }
          } catch (e) {
            // Можно обработать ошибку (например, показать toast)
          }
          // Если слишком много попыток — останавливаем polling и помечаем зависшие как rejected
          if (triesRef.current > maxTries) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            setDocs((prev) =>
              (Array.isArray(prev) ? prev : []).map((d) =>
                d.status === "processing"
                  ? {
                      ...d,
                      status: "rejected",
                      error_message:
                        "Per ilgai apdorojama. Dokumentas atmestas dėl laiko limito.",
                    }
                  : d
              )
            );
          }
        }, intervalMs);
      }
    } else {
      // Нет processing — polling не нужен, сбрасываем
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        triesRef.current = 0;
      }
    }

    // Очищаем polling при размонтировании компоненты
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        triesRef.current = 0;
      }
    };
    // eslint-disable-next-line
  }, [docs, setDocs, intervalMs, maxTries]);
}
