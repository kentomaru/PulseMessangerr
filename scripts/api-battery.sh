#!/bin/bash
# Расширенная батарея проверок Pulse (API-уровень).
BASE=localhost:3000
CID=$(cat /tmp/fixture_dm.txt)
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  ✅ $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  ❌ $1"; }
chk(){ [ "$1" = "$2" ] && ok "$3" || bad "$3 (получено: $1)"; }

echo "── Аутентификация ──"
chk "$(curl -s localhost:3000/api/health | grep -c '"db":true')" 1 "health: БД жива"
chk "$(curl -s localhost:3000/api/auth/me -b /tmp/alice.jar | grep -c '"username":"alice"')" 1 "сессия alice жива"
chk "$(curl -s localhost:3000/api/auth/me -b /tmp/bob.jar | grep -c '"username":"bob"')" 1 "сессия bob жива"
chk "$(curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/auth/me)" 401 "без куки — 401"
chk "$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"alice","password":"неверный"}' -o /dev/null -w '%{http_code}')" 401 "неверный пароль — 401"
chk "$(curl -s -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' -d '{"username":"shorty1","password":"1234567","displayName":"S"}' | grep -c 'не короче 8')" 1 "пароль <8 отвергается"

echo "── Пользователи/поиск ──"
chk "$(curl -s "localhost:3000/api/users/search?q=bob" -b /tmp/alice.jar | grep -c '"username":"bob"')" 1 "поиск находит bob"
chk "$(curl -s "localhost:3000/api/users/search?q=zzzzzzz" -b /tmp/alice.jar | grep -c '"username":"bob"')" 0 "поиск мусора пуст"

echo "── Сообщения ──"
KEY="bat-$(date +%s%N)"
ID1=$(curl -s -X POST localhost:3000/api/messages -b /tmp/alice.jar -H 'Content-Type: application/json' -d "{\"conversationId\":\"$CID\",\"type\":\"text\",\"content\":\"батарея\",\"clientKey\":\"$KEY\"}" | grep -o '"id":"[a-f0-9-]*"' | head -1 | cut -d'"' -f4)
[ -n "$ID1" ] && ok "сообщение создано" || bad "сообщение создано"
ID2=$(curl -s -X POST localhost:3000/api/messages -b /tmp/alice.jar -H 'Content-Type: application/json' -d "{\"conversationId\":\"$CID\",\"type\":\"text\",\"content\":\"батарея\",\"clientKey\":\"$KEY\"}" | grep -o '"id":"[a-f0-9-]*"' | head -1 | cut -d'"' -f4)
chk "$ID2" "$ID1" "идемпотентность clientKey"
LST=$(curl -s "localhost:3000/api/messages?conversationId=$CID" -b /tmp/alice.jar | grep -c "$ID1")
chk "$LST" 1 "сообщение в ленте ровно одно"
chk "$(curl -s -X POST localhost:3000/api/messages -b /tmp/bob.jar -H 'Content-Type: application/json' -d "{\"conversationId\":\"$CID\",\"type\":\"text\",\"content\":\"от боба\"}" | grep -c '"id"')" 1 "bob тоже пишет"
chk "$(curl -s -X DELETE localhost:3000/api/messages/$ID1 -b /tmp/alice.jar -o /dev/null -w '%{http_code}')" 200 "своё сообщение удаляется"
chk "$(curl -s "localhost:3000/api/messages?conversationId=$CID" -b /tmp/alice.jar | grep -c "$ID1")" 0 "удалённого нет в ленте"

echo "── Группы ──"
GID=$(curl -s -X POST localhost:3000/api/conversations -b /tmp/alice.jar -H 'Content-Type: application/json' -d '{"kind":"group","name":"Батарея-тест","memberIds":[]}' | grep -o '"id":"[a-f0-9-]*"' | head -1 | cut -d'"' -f4)
[ -n "$GID" ] && ok "группа создаётся" || bad "группа создаётся"
chk "$(curl -s -X POST localhost:3000/api/conversations/$GID/wallpaper -b /tmp/alice.jar -H 'Content-Type: application/json' -d '{"wallpaper":"g3"}' -o /dev/null -w '%{http_code}')" 200 "обои группы ставятся"
chk "$(curl -s -X POST localhost:3000/api/conversations/$GID/wallpaper -b /tmp/alice.jar -H 'Content-Type: application/json' -d '{"wallpaper":"javascript:alert(1)"}' -o /dev/null -w '%{http_code}')" 400 "левые обои отвергаются"
chk "$(curl -s -X DELETE localhost:3000/api/conversations/$GID -b /tmp/alice.jar -o /dev/null -w '%{http_code}')" 200 "группа удаляется владельцем"

echo "── Файлы ──"
printf 'battery test payload 123' > /tmp/bat_file.txt
FURL=$(curl -s -b /tmp/alice.jar -X POST "localhost:3000/api/upload?name=bat.txt&type=text/plain&size=23" --data-binary @/tmp/bat_file.txt | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
[ -n "$FURL" ] && ok "файл загружается" || bad "файл загружается"
chk "$(curl -s -b /tmp/alice.jar -o /tmp/bat_back.txt -w '%{http_code}' localhost:3000$FURL)" 200 "файл отдаётся"
chk "$(cat /tmp/bat_back.txt)" "battery test payload 123" "содержимое совпадает"
RC=$(curl -s -o /dev/null -w '%{http_code}' "localhost:3000/api/files/..%2F..%2Fetc%2Fpasswd" -b /tmp/alice.jar)
{ [ "$RC" = "400" ] || [ "$RC" = "404" ]; } && ok "path traversal блокируется ($RC)" || bad "path traversal блокируется (получено: $RC)"

echo "── Приватность/профиль ──"
chk "$(curl -s -X PATCH localhost:3000/api/auth/me -b /tmp/alice.jar -H 'Content-Type: application/json' -d '{"showOnline":false}' | grep -c '"showOnline":false')" 1 "приватность обновляется"
chk "$(curl -s -X PATCH localhost:3000/api/auth/me -b /tmp/alice.jar -H 'Content-Type: application/json' -d '{"statusEmoji":"🚀"}' | grep -c '🚀')" 1 "статус-эмодзи ставится"

echo "── Звонки ──"
C1=$(curl -s -X POST localhost:3000/api/calls -b /tmp/alice.jar -H 'Content-Type: application/json' -d "{\"conversationId\":\"$CID\",\"media\":\"audio\"}" | grep -o '"id":"[a-f0-9-]*"' | head -1 | cut -d'"' -f4)
[ -n "$C1" ] && ok "звонок создаётся" || bad "звонок создаётся"
chk "$(curl -s localhost:3000/api/calls/$C1 -b /tmp/alice.jar | grep -o '"status":"[a-z]*"' | head -1)" '"status":"ringing"' "статус ringing"
C2=$(curl -s -X POST localhost:3000/api/calls -b /tmp/alice.jar -H 'Content-Type: application/json' -d "{\"conversationId\":\"$CID\",\"media\":\"audio\"}" | grep -o '"id":"[a-f0-9-]*"' | head -1 | cut -d'"' -f4)
chk "$C2" "$C1" "повторный звонок не дублируется"
chk "$(curl -s -X POST localhost:3000/api/calls/$C1 -b /tmp/alice.jar -H 'Content-Type: application/json' -d '{"action":"state","screenOn":true}' -o /dev/null -w '%{http_code}')" 200 "state screenOn принимается"
chk "$(curl -s localhost:3000/api/calls/$C1 -b /tmp/alice.jar | grep -c '"screenOn":true')" 1 "screenOn виден в комнате"
chk "$(curl -s -X POST localhost:3000/api/calls/$C1 -b /tmp/alice.jar -H 'Content-Type: application/json' -d '{"action":"signal","to":"00000000-0000-0000-0000-000000000000","kind":"ice","payload":{"candidate":"x"}}' -o /dev/null -w '%{http_code}')" 200 "signal relay отвечает"
chk "$(curl -s -X POST localhost:3000/api/calls/$C1 -b /tmp/alice.jar -H 'Content-Type: application/json' -d '{"action":"end"}' -o /dev/null -w '%{http_code}')" 200 "звонок завершается"
chk "$(curl -s localhost:3000/api/calls/$C1 -b /tmp/alice.jar | grep -o '"status":"[a-z]*"' | head -1)" '"status":"ended"' "статус ended"

echo ""
echo "ИТОГО: ✅ $PASS / ❌ $FAIL"
