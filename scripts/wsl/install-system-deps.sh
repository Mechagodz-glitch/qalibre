#!/usr/bin/env bash
set -eo pipefail

sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates git build-essential rsync postgresql postgresql-contrib

export NVM_VERSION="v0.40.4"
if [ ! -d "$HOME/.nvm" ]; then
  curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
fi

export NVM_DIR="$HOME/.nvm"
set +u
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

nvm install --lts
nvm use --lts
nvm alias default 'lts/*'
set -u

sudo service postgresql start

echo
echo "Installed:"
node -v
npm -v
psql --version
git --version
