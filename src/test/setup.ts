import { configure } from '@testing-library/react'

// The suite is ~2 900 tests over ~275 files, run with v8 coverage on shared CI runners.
// Page tests that import a lot (TaskDetailPage, PersonasPage...) were seen failing, a
// different one each run, on `findBy*` after 1 s (the default) or on the 5 s test timeout,
// while passing alone and on an idle machine. Same assertions, more time.
configure({ asyncUtilTimeout: 4000 })
