export function showConflictDialog(onReload: () => void, onSaveCopy: () => void) {
  const dialog = document.getElementById('conflict-dialog') as HTMLDialogElement;
  const btnReload = document.getElementById('btn-conflict-reload') as HTMLButtonElement;
  const btnCopy = document.getElementById('btn-conflict-copy') as HTMLButtonElement;

  if (!dialog || !btnReload || !btnCopy) return;

  // clean up old listeners
  const newReload = btnReload.cloneNode(true);
  const newCopy = btnCopy.cloneNode(true);
  btnReload.replaceWith(newReload);
  btnCopy.replaceWith(newCopy);

  newReload.addEventListener('click', () => {
    dialog.close();
    onReload();
  });

  newCopy.addEventListener('click', () => {
    dialog.close();
    onSaveCopy();
  });

  dialog.showModal();
}
