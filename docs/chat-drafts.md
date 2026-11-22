# Chat drafts

Unsent text in an existing conversation is saved by conversation ID. Before the
first message creates a conversation, the draft is saved separately for each
workspace, using the workspace of the current tab's route. It survives reloads;
editing a new conversation in another workspace cannot overwrite it.

Text typed while a conversation opens follows the resulting session. If the
opening fails, the message is restored to the workspace where it was sent, even
if the user has since moved elsewhere. A failed opening retains its uploaded
attachments with the workspace's error so a retry can include them. Messages
queued during an opening follow that session and are handed to the server even
when another workspace is on screen.

Older versions stored one shared, unscoped new-conversation draft. Since its
original workspace is unknown, the first workspace opened without an existing
draft claims it. An explicit sign-out clears all saved drafts on that browser.
