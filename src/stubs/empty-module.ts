/**
 * Stub module used by Vite aliases to satisfy optional peer dependencies
 * of nextstepjs (next/navigation, @remix-run/react) which are not used in this project.
 *
 * Exports no-op functions matching the named imports expected by nextstepjs adapters.
 */

// next/navigation stubs
export const useRouter = () => ({
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
})
export const usePathname = () => '/'

// @remix-run/react stubs
export const useNavigate = () => () => {}
export const useLocation = () => ({ pathname: '/', search: '', hash: '', state: null, key: '' })
