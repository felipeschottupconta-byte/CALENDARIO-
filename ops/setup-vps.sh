#!/usr/bin/env bash
# ============================================================
# setup-vps.sh — hardening inicial do VPS (RN Contabilidade)
#
# Rode como root, uma única vez, logo após o primeiro acesso.
# Uso:
#   ssh root@SEU_IP
#   nano setup-vps.sh   (cole o conteúdo, ajuste USUARIO)
#   chmod +x setup-vps.sh
#   ./setup-vps.sh
# ============================================================
set -euo pipefail

USUARIO="felipe"          # <-- troque se quiser outro nome
PORTA_SSH="22"             # pode trocar por uma porta não-padrão, ex: 2222

echo "==> Atualizando o sistema"
apt update && apt upgrade -y

echo "==> Criando usuário sem privilégio de root direto"
if id "$USUARIO" &>/dev/null; then
  echo "Usuário $USUARIO já existe, pulando criação."
else
  adduser --disabled-password --gecos "" "$USUARIO"
  usermod -aG sudo "$USUARIO"
fi

echo "==> Copiando sua chave SSH autorizada para o novo usuário"
mkdir -p /home/$USUARIO/.ssh
if [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys /home/$USUARIO/.ssh/authorized_keys
else
  echo "!! Nenhuma authorized_keys encontrada em /root/.ssh."
  echo "!! Cole sua chave pública manualmente em /home/$USUARIO/.ssh/authorized_keys"
  echo "!! ANTES de fechar esta sessão, ou você vai ficar trancado para fora."
  touch /home/$USUARIO/.ssh/authorized_keys
fi
chmod 700 /home/$USUARIO/.ssh
chmod 600 /home/$USUARIO/.ssh/authorized_keys
chown -R $USUARIO:$USUARIO /home/$USUARIO/.ssh

echo "==> Instalando pacotes essenciais"
apt install -y ufw fail2ban git curl unzip python3-pip python3-venv \
  build-essential tesseract-ocr tesseract-ocr-por logrotate

echo "==> Configurando firewall (UFW)"
ufw default deny incoming
ufw default allow outgoing
ufw allow "$PORTA_SSH"/tcp
ufw --force enable

echo "==> Configurando fail2ban para SSH"
cat > /etc/fail2ban/jail.local << EOF
[sshd]
enabled = true
port = $PORTA_SSH
maxretry = 4
bantime = 3600
findtime = 600
EOF
systemctl enable fail2ban
systemctl restart fail2ban

echo "==> Hardening do SSH — login por senha e root direto ficam desativados"
SSHD=/etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' $SSHD
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' $SSHD
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' $SSHD
if [ "$PORTA_SSH" != "22" ]; then
  sed -i "s/^#\?Port .*/Port $PORTA_SSH/" $SSHD
fi

echo "==> Node.js LTS (para eventuais bots em JS) via nvm do usuário $USUARIO"
sudo -u $USUARIO bash -c '
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install --lts
'

echo "==> Estrutura de diretórios do projeto"
sudo -u $USUARIO mkdir -p /home/$USUARIO/apps
sudo -u $USUARIO mkdir -p /home/$USUARIO/apps/watcher-guias
sudo -u $USUARIO mkdir -p /home/$USUARIO/apps/nfse_bot_v2
sudo -u $USUARIO mkdir -p /home/$USUARIO/apps/dec-rj-bot
sudo -u $USUARIO mkdir -p /home/$USUARIO/logs

echo "==> Configurando logrotate para os apps"
cat > /etc/logrotate.d/rn-apps << EOF
/home/$USUARIO/logs/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
EOF

echo ""
echo "============================================================"
echo "TUDO PRONTO. AGORA, ANTES DE FECHAR ESTA SESSÃO:"
echo ""
echo "1) Abra um SEGUNDO terminal e teste o login:"
echo "   ssh -p $PORTA_SSH $USUARIO@SEU_IP"
echo ""
echo "2) SÓ DEPOIS de confirmar que o login funciona, reinicie o ssh:"
echo "   systemctl restart sshd"
echo ""
echo "Se reiniciar o ssh sem testar antes e a chave estiver errada,"
echo "você tranca o próprio acesso ao servidor."
echo "============================================================"
