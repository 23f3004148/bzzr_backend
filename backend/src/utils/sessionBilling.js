const { getCachedConfig } = require('../services/adminConfigCache');

const getBillingConfig = async () => {
  const settings = await getCachedConfig();
  const graceMinutes = Number(settings?.sessionGraceMinutes ?? 3);
  const graceSeconds = Math.max(0, graceMinutes) * 60;
  const hardStopEnabled = settings?.sessionHardStopEnabled !== false;
  return { graceSeconds, hardStopEnabled };
};

const computeElapsedSeconds = (start, end, durationMinutes, hardStopEnabled) => {
  if (!start || !end) return 0;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  const rawSeconds = Math.floor((endMs - startMs) / 1000);
  const maxSeconds =
    hardStopEnabled && durationMinutes
      ? Math.max(0, Number(durationMinutes) * 60)
      : Number.POSITIVE_INFINITY;
  return Math.min(rawSeconds, maxSeconds);
};

const computeBillableSeconds = (elapsedSeconds, graceSeconds) =>
  Math.max(0, Math.floor(elapsedSeconds) - Math.max(0, Math.floor(graceSeconds)));

const computeBillableMinutes = (billableSeconds) =>
  billableSeconds > 0 ? Math.ceil(billableSeconds / 60) : 0;

module.exports = {
  getBillingConfig,
  computeElapsedSeconds,
  computeBillableSeconds,
  computeBillableMinutes,
};
