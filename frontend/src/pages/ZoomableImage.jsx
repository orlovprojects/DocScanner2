// import { useRef, useState, useEffect } from "react";
// import { Box, IconButton, Tooltip } from "@mui/material";
// import ZoomInIcon from "@mui/icons-material/ZoomIn";
// import ZoomOutIcon from "@mui/icons-material/ZoomOut";
// import FitScreenIcon from "@mui/icons-material/FitScreen";

// export default function ZoomableImage({ src, initialZoom = 0.80, buttonSize = 40, maxHeight = 480 }) {
//   const [zoom, setZoom] = useState(initialZoom);
//   const imgRef = useRef(null);
//   const containerRef = useRef(null);

//   // Размер иконки пропорционален кнопке
//   const iconSize = Math.round(buttonSize * 0.6);

//   // Fit image to container width
//   const fitToPage = () => {
//     if (imgRef.current && containerRef.current) {
//       const imgWidth = imgRef.current.naturalWidth;
//       const containerWidth = containerRef.current.offsetWidth;
//       if (imgWidth && containerWidth) {
//         setZoom(containerWidth / imgWidth);
//       } else {
//         setZoom(1);
//       }
//     }
//   };

//   // Zoom in (до 3x)
//   const handleZoomIn = () => {
//     setZoom((z) => Math.min(z + 0.20, 3));
//   };

//   // Zoom out (до 0.20x)
//   const handleZoomOut = () => {
//     setZoom((z) => Math.max(z - 0.20, 0.20));
//   };

//   // При смене картинки — установить начальный zoom
//   useEffect(() => {
//     setZoom(initialZoom);
//   }, [src, initialZoom]);

//   return (
//     <Box>
//       <Box display="flex" gap={0.5} mb={1} ml={1}>
//         <Tooltip title="Užpildyti peržiūros langą">
//           <IconButton 
//             onClick={fitToPage}
//             sx={{ width: buttonSize, height: buttonSize }}
//           >
//             <FitScreenIcon sx={{ fontSize: iconSize }} />
//           </IconButton>
//         </Tooltip>
//         <Tooltip title="Sumažinti">
//           <span>
//             <IconButton 
//               onClick={handleZoomOut} 
//               disabled={zoom <= 0.25}
//               sx={{ width: buttonSize, height: buttonSize }}
//             >
//               <ZoomOutIcon sx={{ fontSize: iconSize }} />
//             </IconButton>
//           </span>
//         </Tooltip>
//         <Tooltip title="Padidinti">
//           <span>
//             <IconButton 
//               onClick={handleZoomIn} 
//               disabled={zoom >= 3}
//               sx={{ width: buttonSize, height: buttonSize }}
//             >
//               <ZoomInIcon sx={{ fontSize: iconSize }} />
//             </IconButton>
//           </span>
//         </Tooltip>
//       </Box>
//       <Box
//         ref={containerRef}
//         overflow="auto"
//         maxHeight={maxHeight}
//         minHeight={200}
//         border="1px solid #eee"
//         borderRadius={2}
//         position="relative"
//         sx={{ background: "#fafafa" }}
//       >
//         <img
//           ref={imgRef}
//           src={src}
//           alt="Preview"
//           style={{
//             display: "block",
//             margin: "0 auto",
//             width: `${zoom * 100}%`,
//             height: "auto",
//             borderRadius: 4,
//             transition: "width 0.2s",
//             maxWidth: "none",
//             maxHeight: "none",
//           }}
//           draggable={false}
//         />
//       </Box>
//     </Box>
//   );
// }

import { useRef, useState, useEffect, useCallback } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";

export default function ZoomableImage({
  src,
  initialZoom = 0.8,
  buttonSize = 40,
  maxHeight = 480,
  documentMode = false,
  fitOnLoad = false,
  fitRatio = 1,
}) {
  const [zoom, setZoom] = useState(initialZoom);
  const [imageReady, setImageReady] = useState(false);
  const [naturalSize, setNaturalSize] = useState({
    width: 0,
    height: 0,
  });

  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const userZoomedRef = useRef(false);
  const skipResizeRef = useRef(false);

  const iconSize = Math.round(buttonSize * 0.6);

  const fitToPage = useCallback(
    (imageWidthOverride = null) => {
      const imageWidth =
        imageWidthOverride ||
        naturalSize.width ||
        imgRef.current?.naturalWidth;

      const containerWidth = containerRef.current?.clientWidth;

      if (!imageWidth || !containerWidth) {
        return;
      }

      const availableWidth = Math.max(
        1,
        containerWidth - (documentMode ? 0 : 2)
      );

      const nextZoom = Math.min(
        1,
        (availableWidth * fitRatio) / imageWidth
      );

      userZoomedRef.current = false;
      setZoom(prev => Math.abs(prev - nextZoom) < 0.01 ? prev : nextZoom);
    },
    [naturalSize.width, documentMode, fitRatio]
  );

  const handleZoomIn = () => {
    userZoomedRef.current = true;
    setZoom((current) => Math.min(current + 0.15, 3));
  };

  const handleZoomOut = () => {
    userZoomedRef.current = true;
    setZoom((current) => Math.max(current - 0.15, 0.1));
  };

  const handleImageLoad = (event) => {
    const width = event.currentTarget.naturalWidth;
    const height = event.currentTarget.naturalHeight;

    setNaturalSize({ width, height });

    if (!fitOnLoad) {
      setZoom(initialZoom);
      setImageReady(true);
      return;
    }

    requestAnimationFrame(() => {
      const containerWidth = containerRef.current?.clientWidth;

      if (!width || !containerWidth) {
        setZoom(initialZoom);
        setImageReady(true);
        return;
      }

      const availableWidth = Math.max(
        1,
        containerWidth - (documentMode ? 0 : 2)
      );

      const nextZoom = Math.min(
        1,
        (availableWidth * fitRatio) / width
      );

      userZoomedRef.current = false;
      skipResizeRef.current = true;
      setZoom(nextZoom);
      setImageReady(true);
      setTimeout(() => { skipResizeRef.current = false; }, 400);
    });
  };

  useEffect(() => {
    userZoomedRef.current = false;
    setImageReady(false);
    setNaturalSize({ width: 0, height: 0 });
    setZoom(initialZoom);
  }, [src, initialZoom]);

  useEffect(() => {
    if (!fitOnLoad || !naturalSize.width) {
      return undefined;
    }

    const container = containerRef.current;

    if (!container || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      if (!userZoomedRef.current && !skipResizeRef.current) {
        fitToPage();
      }
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [fitOnLoad, naturalSize.width, fitToPage]);

  const renderedWidth = naturalSize.width
    ? Math.max(1, Math.round(naturalSize.width * zoom))
    : null;

  return (
    <Box
      sx={{
        width: "100%",
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          gap: 0.5,
          mb: 1,
          ml: documentMode ? 1 : 1,
          minHeight: buttonSize,
          alignItems: "center",
        }}
      >
        <Tooltip title="Pritaikyti prie lango">
          <IconButton
            onClick={() => fitToPage()}
            sx={{
              width: buttonSize,
              height: buttonSize,
            }}
          >
            <FitScreenIcon sx={{ fontSize: iconSize }} />
          </IconButton>
        </Tooltip>

        <Tooltip title="Sumažinti">
          <span>
            <IconButton
              onClick={handleZoomOut}
              disabled={zoom <= 0.11}
              sx={{
                width: buttonSize,
                height: buttonSize,
              }}
            >
              <ZoomOutIcon sx={{ fontSize: iconSize }} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Padidinti">
          <span>
            <IconButton
              onClick={handleZoomIn}
              disabled={zoom >= 3}
              sx={{
                width: buttonSize,
                height: buttonSize,
              }}
            >
              <ZoomInIcon sx={{ fontSize: iconSize }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box
        ref={containerRef}
        sx={
          documentMode
            ? {
                width: "100%",
                minWidth: 0,
                minHeight: 0,
                overflow: "visible",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: 0,
              }
            : {
                width: "100%",
                minWidth: 0,
                minHeight: 200,
                maxHeight,
                overflow: "auto",
                backgroundColor: "#fafafa",
                border: "1px solid #eee",
                borderRadius: 2,
              }
        }
      >
        <Box
          sx={{
            width: "100%",
            minWidth: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          <Box
            ref={imgRef}
            component="img"
            src={src}
            alt="Preview"
            onLoad={handleImageLoad}
            draggable={false}
            sx={{
              display: "block",
              width:
                imageReady && renderedWidth
                  ? `${renderedWidth}px`
                  : "1px",
              height: "auto",
              maxWidth: "none",
              maxHeight: "none",
              flexShrink: 0,
              backgroundColor: "#fff",
              borderRadius: documentMode ? 0 : 1,
              visibility: imageReady ? "visible" : "hidden",
              transition: userZoomedRef.current
                ? "width 0.2s ease"
                : "none",
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}