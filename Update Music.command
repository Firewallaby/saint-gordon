#!/bin/zsh
cd -- "${0:A:h}" || exit 1
python3 scripts/update_soundcloud.py
result=$?
if [[ $result -eq 0 ]]; then
  print '\nFinished. Refresh your local preview. Upload dist/ to update your hosted website.'
else
  print '\nThe update could not finish. See the message above.'
fi
read '?Press Enter to close this window.'
exit $result
