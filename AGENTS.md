# Jarvas

## Estrutura

- `core/`: backend Java 21, Spring Boot e Maven Wrapper.
- `interface/`: frontend Next.js, React, TypeScript, Tailwind CSS e pnpm.
- Não há comando único na raiz; execute cada aplicação em seu diretório.
- `.tasks.md` registra pontos futuros ou ainda não confirmados; não os trate como requisitos implementados.

## Contratos e segurança

- Mantenha `OPENAI_API_KEY` exclusivamente no backend e nunca a versione ou registre.
- O chat recebe e devolve mensagens com `role` e `content`; o cliente só pode enviar `user` e `assistant`.
- As instruções do Jarvas permanecem sob controle do backend.
- Preserve os limites compartilhados: 20 mensagens, 4.000 caracteres por mensagem e 20.000 no total.
- Transcrição usa `multipart/form-data` com o campo `file`; voz recebe JSON com `text` e retorna `audio/mpeg`.
- O histórico atual existe apenas em memória. Não adicione persistência sem solicitação explícita.

## Implementação

- No backend, mantenha controllers, DTOs e services separados; valide entradas antes de chamar serviços externos.
- No frontend, mantenha chamadas HTTP em `interface/src/services` e preserve a alternativa de entrada por texto.
- Ao alterar áudio, preserve cancelamento e limpeza de microfone, timers, `AudioContext`, reprodução e URLs de objeto.
- Preserve acessibilidade e `prefers-reduced-motion`.
- Testes automatizados devem usar mocks e nunca fazer chamadas pagas à OpenAI.
- Preserve alterações locais não relacionadas.

## Comandos

Backend, a partir de `core/`:

```bash
./mvnw spring-boot:run
./mvnw test
```

Frontend, a partir de `interface/`:

```bash
pnpm dev
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

Antes de concluir uma alteração, execute as verificações pertinentes ao escopo e diferencie testes automatizados de validação manual em navegador, microfone ou API real.
