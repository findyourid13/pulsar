# Pulsar

[English](README.md) | [한국어](README.ko.md)

내 Cosmo 오브젝트 중 하나를 다른 창들 위에 떠 있는, 천천히 회전하는 카드로 보여줍니다.

Pulsar는 MODHAUS 또는 소속 아티스트와 제휴, 승인, 후원 관계가 없습니다. 오브젝트 아트워크의 저작권은 MODHAUS에 있으며, Pulsar는 이를 사용자별로 실행 시점에 가져와 로컬에 캐시할 뿐 번들링하거나 재배포하지 않습니다.

## 기능

Pulsar는 MODHAUS의 Cosmo 앱에 있는 디지털 포토카드 오브젝트 하나를 양면 카드로 렌더링해, 데스크탑 위에서 천천히 회전시킵니다. 항상 최상단에 표시되며 카드 부분을 제외하면 클릭이 그대로 통과됩니다. Cosmo 이메일로 로그인하면 내 컬렉션을 돌릴 수 있습니다.

모든 기능은 트레이 아이콘에서 제어합니다:

- **Appearance** — 다음 오브젝트로 넘기기, 크기 선택, 투명도 조절
- **Spinning** — 회전 정지, 회전 속도 변경(회전당 15/30/60초), 회전 방향 반전
- **Collection** — 보여줄 오브젝트 선택, 일정 주기로 셔플(또는 끄기), 즉시 새로고침, 마지막 캐시 시각 확인
- **Connection** — Cosmo 로그인/로그아웃, 컬렉션이 실시간/캐시됨/사용 불가 중 어떤 상태인지 확인
- **Utilities** — 카드 클릭 통과 여부 전환, 화면 중앙으로 이동
- **System** — 로그인 시 자동 실행

## 시작하기

[Releases](https://github.com/findyourid13/pulsar/releases)에서 최신 빌드를 받으세요 — macOS는 `.dmg`, Windows는 설치 파일입니다.

서명되지 않은 빌드라 최초 실행 시 OS가 경고를 띄웁니다:

- **macOS**: "Apple에서 확인할 수 없습니다" — 앱을 우클릭 → 열기, 그다음 확인.
- **Windows**: SmartScreen "Windows에서 PC를 보호했습니다" → 추가 정보 → 실행.

처음 실행하면 카드는 자리표시자(placeholder)를 보여줍니다 — 트레이 아이콘의 "Sign in to Cosmo…"로 로그인하면 내 컬렉션이 돌아갑니다. 업데이트는 자동으로 확인됩니다.

## 소스에서 빌드하기

```sh
npm install
npm run dev
```

Node.js와 npm이 필요합니다.

```sh
npm run build        # electron-vite 프로덕션 빌드
npm run package      # 빌드 + electron-builder, 현재 플랫폼용
npm run package:mac  # dmg
npm run package:win  # nsis 설치 파일
```

macOS에서 Windows용 NSIS 설치 파일을 크로스 빌드하려면 `wine`이 설치되어 있어야 합니다(electron-builder가 설치 파일 생성 단계에서 이를 호출합니다). 없어도 `--dir` 옵션으로 패키징 확인용 `dist/win-unpacked/` 빌드는 정상적으로 생성됩니다.
