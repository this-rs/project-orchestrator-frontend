export default {
  aria: 'Allow the task to run in this folder',
  title: 'Run in this folder?',
  hint: 'Nothing starts until you answer. Only you can allow it.',
  allow: 'Allow',
  reject: 'Refuse',
  state: {
    confirmed: 'Confirmed: the task is starting.',
    rejected: 'Refused: nothing was run.',
    expired: 'Expired: ask for the delegation again.',
  },
  error: {
    forbidden: 'Only the owner of this request can answer it.',
    conflict: 'This request was already answered or no longer matches.',
    other: 'The answer could not be sent',
  },
}
