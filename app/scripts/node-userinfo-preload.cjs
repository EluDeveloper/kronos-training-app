// Work around uv_os_get_passwd failures in this Windows QA environment before tsx initializes.
if (typeof process.geteuid !== 'function')
  Object.defineProperty(process, 'geteuid', { value: () => 0 })
