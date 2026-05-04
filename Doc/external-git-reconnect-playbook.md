# External Git Reconnect Playbook

외부 GitHub 연결이 불안정할 때, 개발을 멈추지 않고 로컬 기준으로 안전하게 진행하기 위한 운영 규칙.

## 1. 현재 운영 모드

- 원격 push는 보류한다.
- 모든 변경은 로컬 commit으로만 관리한다.
- 작업 시작/종료 시 백업 번들을 생성한다.

## 2. 로컬 안전 수칙

1) 작업 시작 전

```bash
git status --short --branch
git bundle create ../SnapSpace-3D-prework-$(date +%Y%m%d-%H%M%S).bundle --all
```

2) 작업 단위 완료 시

```bash
git add -A
git commit -m "작업 요약"
```

3) 하루 종료 전

```bash
git bundle create ../SnapSpace-3D-eod-$(date +%Y%m%d-%H%M%S).bundle --all
git log --oneline -n 20
```

## 3. 브랜치 운영 규칙 (원격 없이)

- main은 안정 버전만 유지
- 기능 작업은 별도 브랜치에서 진행

```bash
git switch -c feat/<topic>
```

- 검증 완료 후 main에 병합

```bash
git switch main
git merge --no-ff feat/<topic>
```

## 4. 재연결 시점 체크리스트

아래 항목이 충족되면 외부 Git 재연결을 다시 시도한다.

- 새 토큰 또는 SSH 인증 경로 확정
- workflow 권한 포함 확인
- 키체인 캐시 정리 완료
- 로컬 백업 번들 최신본 생성 완료

## 5. 재연결 명령 (권장: SSH)

1) SSH 키 등록/인증 확인

```bash
ssh -T git@martin-personal
```

참고:
- GitHub는 SSH 인증 성공 시에도 `"does not provide shell access"`와 함께 exit code 1을 반환할 수 있다.
- 인증 성공 판정은 exit code보다 `"successfully authenticated"` 문구를 우선한다.

2) 원격 전환

```bash
git remote set-url origin git@martin-personal:jung-jae-hun/SnapSpace-3D.git
```

3) 업로드

```bash
git push -u origin main
```

## 6. HTTPS를 써야 할 때

- PAT에 반드시 workflow 권한 포함
- 키체인 기존 자격증명 제거 후 재입력

```bash
printf "protocol=https\nhost=github.com\n" | git credential-osxkeychain erase || true
printf "protocol=https\nhost=github.com\nusername=jung-jae-hun\n" | git credential-osxkeychain erase || true
git push -u origin main
```

## 7. 복구 시나리오

백업 번들에서 즉시 복구 가능.

```bash
git clone ../SnapSpace-3D-eod-YYYYMMDD-HHMMSS.bundle snapspace-3d-recovery
cd snapspace-3d-recovery
git log --oneline -n 20
```
