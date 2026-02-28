import { useRef, useState, useEffect } from "react";
import { Box, IconButton, Tooltip } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";

export default function ZoomableImage({ src, initialZoom = 0.80, buttonSize = 40, maxHeight = 480 }) {
  const [zoom, setZoom] = useState(initialZoom);
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Размер иконки пропорционален кнопке
  const iconSize = Math.round(buttonSize * 0.6);

  // Fit image to container width
  const fitToPage = () => {
    if (imgRef.current && containerRef.current) {
      const imgWidth = imgRef.current.naturalWidth;
      const containerWidth = containerRef.current.offsetWidth;
      if (imgWidth && containerWidth) {
        setZoom(containerWidth / imgWidth);
      } else {
        setZoom(1);
      }
    }
  };

  // Zoom in (до 3x)
  const handleZoomIn = () => {
    setZoom((z) => Math.min(z + 0.20, 3));
  };

  // Zoom out (до 0.20x)
  const handleZoomOut = () => {
    setZoom((z) => Math.max(z - 0.20, 0.20));
  };

  // При смене картинки — установить начальный zoom
  useEffect(() => {
    setZoom(initialZoom);
  }, [src, initialZoom]);

  return (
    <Box>
      <Box display="flex" gap={0.5} mb={1} ml={1}>
        <Tooltip title="Užpildyti peržiūros langą">
          <IconButton 
            onClick={fitToPage}
            sx={{ width: buttonSize, height: buttonSize }}
          >
            <FitScreenIcon sx={{ fontSize: iconSize }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Sumažinti">
          <span>
            <IconButton 
              onClick={handleZoomOut} 
              disabled={zoom <= 0.25}
              sx={{ width: buttonSize, height: buttonSize }}
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
              sx={{ width: buttonSize, height: buttonSize }}
            >
              <ZoomInIcon sx={{ fontSize: iconSize }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box
        ref={containerRef}
        overflow="auto"
        maxHeight={maxHeight}
        minHeight={200}
        border="1px solid #eee"
        borderRadius={2}
        position="relative"
        sx={{ background: "#fafafa" }}
      >
        <img
          ref={imgRef}
          src={src}
          alt="Preview"
          style={{
            display: "block",
            margin: "0 auto",
            width: `${zoom * 100}%`,
            height: "auto",
            borderRadius: 4,
            transition: "width 0.2s",
            maxWidth: "none",
            maxHeight: "none",
          }}
          draggable={false}
        />
      </Box>
    </Box>
  );
}



// import { useRef, useState, useEffect } from "react";
// import { Box, IconButton, Tooltip } from "@mui/material";
// import ZoomInIcon from "@mui/icons-material/ZoomIn";
// import ZoomOutIcon from "@mui/icons-material/ZoomOut";
// import FitScreenIcon from "@mui/icons-material/FitScreen";

// export default function ZoomableImage({ src, initialZoom = 0.80 }) {
//   const [zoom, setZoom] = useState(initialZoom);
//   const imgRef = useRef(null);
//   const containerRef = useRef(null);

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
//       <Box display="flex" gap={1} mb={1}>
//         <Tooltip title="Užpildyti peržiūros langą">
//           <IconButton onClick={fitToPage}>
//             <FitScreenIcon />
//           </IconButton>
//         </Tooltip>
//         <Tooltip title="Sumažinti">
//           <span>
//             <IconButton onClick={handleZoomOut} disabled={zoom <= 0.25}>
//               <ZoomOutIcon />
//             </IconButton>
//           </span>
//         </Tooltip>
//         <Tooltip title="Padidinti">
//           <span>
//             <IconButton onClick={handleZoomIn} disabled={zoom >= 3}>
//               <ZoomInIcon />
//             </IconButton>
//           </span>
//         </Tooltip>
//       </Box>
//       <Box
//         ref={containerRef}
//         overflow="auto"
//         maxHeight={480}
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