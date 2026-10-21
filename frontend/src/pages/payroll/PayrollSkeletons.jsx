import { Box, Skeleton, Stack } from "@mui/material";

// Bendri „skeleton“ vaizdai grafikui, tabeliui ir taisyklėms (vietoj suktuko kampe)
export function GridSkeleton({ rows = 6, days = 30, withPlan = false, toolbar = true, totals = 0 }) {
  return (
    <Box>
      {toolbar && (
        <Stack direction="row" alignItems="center" gap={1.25} mb={1.75} flexWrap="wrap">
          <Skeleton variant="rounded" width={200} height={34} />
          <Skeleton variant="rounded" width={110} height={26} sx={{ borderRadius: 99 }} />
          <Skeleton variant="rounded" width={90} height={26} sx={{ borderRadius: 99 }} />
          <Box flex={1} />
          <Skeleton variant="rounded" width={140} height={34} />
          <Skeleton variant="rounded" width={110} height={34} />
          <Skeleton variant="rounded" width={36} height={34} />
        </Stack>
      )}
      <Box sx={{ border: "1px solid #EAECF0", borderRadius: 2, overflow: "hidden", bgcolor: "#FFFFFF" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: `200px repeat(${days}, minmax(26px, 1fr))${totals ? ` repeat(${totals}, 52px)` : ""}`,
          borderBottom: "1px solid #EAECF0", bgcolor: "#F9FAFB" }}>
          <Box sx={{ p: 1.25 }}><Skeleton width="60%" /></Box>
          {Array.from({ length: days + totals }).map((_, i) => (
            <Stack key={i} alignItems="center" justifyContent="center" sx={{ py: .75, borderLeft: "1px solid #F2F4F7" }}>
              <Skeleton width={14} height={10} /><Skeleton width={16} height={14} />
            </Stack>
          ))}
        </Box>
        {withPlan && Array.from({ length: 3 }).map((_, r) => (
          <Box key={`p${r}`} sx={{ display: "grid", gridTemplateColumns: `200px repeat(${days}, minmax(26px, 1fr))`, borderBottom: "1px solid #F2F4F7", bgcolor: "#FCFCFD" }}>
            <Stack direction="row" alignItems="center" gap={1} sx={{ p: 1 }}><Skeleton variant="rounded" width={30} height={20} /><Skeleton width="50%" /></Stack>
            {Array.from({ length: days }).map((_, i) => <Box key={i} sx={{ p: .5, borderLeft: "1px solid #F2F4F7" }}><Skeleton variant="rounded" height={20} /></Box>)}
          </Box>
        ))}
        {Array.from({ length: rows }).map((_, r) => (
          <Box key={r} sx={{ display: "grid", gridTemplateColumns: `200px repeat(${days}, minmax(26px, 1fr))${totals ? ` repeat(${totals}, 52px)` : ""}`,
            borderBottom: r < rows - 1 ? "1px solid #F2F4F7" : 0 }}>
            <Box sx={{ p: 1.1 }}>
              <Skeleton width={`${55 + ((r * 13) % 30)}%`} height={16} />
              <Skeleton width="40%" height={12} />
            </Box>
            {Array.from({ length: days + totals }).map((_, i) => (
              <Box key={i} sx={{ p: .5, borderLeft: "1px solid #F2F4F7", display: "flex", alignItems: "center" }}>
                {(i >= days || (i + r) % 3 !== 0) && <Skeleton variant="rounded" width="100%" height={22} sx={{ opacity: i >= days ? .6 : 1 }} />}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export function RulesSkeleton() {
  return (
    <Box sx={{ maxWidth: 980, mx: "auto" }}>
      <Skeleton variant="rounded" height={44} sx={{ mb: 2, borderRadius: 2.5 }} />
      <Stack direction="row" justifyContent="space-between" mb={1.5}>
        <Box><Skeleton width={160} height={26} /><Skeleton width={320} height={16} /></Box>
        <Skeleton variant="rounded" width={150} height={36} />
      </Stack>
      {[3, 2].map((n, g) => (
        <Box key={g} sx={{ mb: 2.25 }}>
          <Stack direction="row" alignItems="center" gap={1} mb={1}><Skeleton variant="rounded" width={26} height={26} /><Skeleton width={160} /></Stack>
          {Array.from({ length: n }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={58} sx={{ mb: .85, borderRadius: 2 }} />
          ))}
        </Box>
      ))}
    </Box>
  );
}

// Tabelio sąrašo vaizdas: kairėje darbuotojai, dešinėje dienos
export function ListSkeleton({ rows = 6, days = 12 }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "264px minmax(0,1fr)" }, gap: 1.5, alignItems: "start" }}>
      <Box sx={{ border: "1px solid #EAECF0", borderRadius: 2.5, bgcolor: "#FFFFFF", overflow: "hidden" }}>
        <Box sx={{ p: 1.1, borderBottom: "1px solid #EAECF0" }}><Skeleton variant="rounded" height={34} /></Box>
        {Array.from({ length: rows }).map((_, i) => (
          <Stack key={i} direction="row" alignItems="center" gap={1.1} sx={{ px: 1.4, py: 1.1, borderBottom: "1px solid #F2F4F7" }}>
            <Skeleton variant="circular" width={30} height={30} />
            <Box sx={{ flex: 1 }}><Skeleton width={`${55 + ((i * 17) % 35)}%`} height={16} /><Skeleton width="45%" height={12} /></Box>
          </Stack>
        ))}
      </Box>
      <Box sx={{ border: "1px solid #EAECF0", borderRadius: 2.5, bgcolor: "#FFFFFF", overflow: "hidden" }}>
        <Box sx={{ p: 2, borderBottom: "1px solid #EAECF0" }}>
          <Skeleton width={200} height={22} /><Skeleton width={260} height={14} />
          <Box sx={{ mt: 1.4, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))", gap: 1 }}>
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rounded" height={48} sx={{ borderRadius: 1.75 }} />)}
          </Box>
        </Box>
        {Array.from({ length: days }).map((_, i) => (
          <Stack key={i} direction="row" alignItems="center" gap={2} sx={{ px: 1.5, height: 38, borderBottom: "1px solid #F2F4F7" }}>
            <Skeleton width={44} /><Skeleton width={100} /><Skeleton sx={{ flex: 1 }} /><Skeleton width={160} />
          </Stack>
        ))}
      </Box>
    </Box>
  );
}
