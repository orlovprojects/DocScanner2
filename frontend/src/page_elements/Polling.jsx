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
            setDocs(data);
          } catch (e) {
            // Можно обработать ошибку (например, показать toast)
          }
          // Если слишком много попыток — останавливаем polling и помечаем зависшие как rejected
          if (triesRef.current > maxTries) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            setDocs((prev) =>
              prev.map((d) =>
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



// import { useEffect, useRef } from "react";
// import { api } from "../api/endpoints";

// // Используй как хук, чтобы запускать polling из UploadPage
// export function usePollingDocumentStatus({ docs, setDocs, intervalMs = 3000, maxTries = 50 }) {
//   const pollingRefs = useRef({});

//   useEffect(() => {
//     docs.forEach((doc) => {
//       if (
//         doc.status === "processing" &&
//         doc.id &&
//         !doc.temp &&
//         !pollingRefs.current[doc.id]
//       ) {
//         let tries = 0;
//         pollingRefs.current[doc.id] = setInterval(async () => {
//           tries++;
//           if (tries > maxTries) {
//             clearInterval(pollingRefs.current[doc.id]);
//             setDocs((prev) =>
//               prev.map((d) =>
//                 d.id === doc.id
//                   ? { ...d, status: "rejected", error_message: "Per ilgai apdorojama. Dokumentas atmestas dėl laiko limito." }
//                   : d
//               )
//             );
//             delete pollingRefs.current[doc.id];
//             return;
//           }
//           try {
//             const { data } = await api.get(`/documents/${doc.id}/`);
//             if (data.status !== "processing") {
//               clearInterval(pollingRefs.current[doc.id]);
//               setDocs((prev) =>
//                 prev.map((d) => (d.id === data.id ? { ...d, ...data } : d))
//               );
//               delete pollingRefs.current[doc.id];
//             }
//           } catch (e) {
//             clearInterval(pollingRefs.current[doc.id]);
//             setDocs((prev) =>
//               prev.map((d) =>
//                 d.id === doc.id
//                   ? { ...d, status: "rejected", error_message: "Klaida tikrinant statusą." }
//                   : d
//               )
//             );
//             delete pollingRefs.current[doc.id];
//           }
//         }, intervalMs);
//       }
//     });

//     // Очистка всех polling при размонтировании
//     return () => {
//       Object.values(pollingRefs.current).forEach(clearInterval);
//     };
//     // eslint-disable-next-line
//   }, [docs]);
// }
