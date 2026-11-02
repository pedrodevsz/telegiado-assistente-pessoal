### 1. Estabilizar a base
   - Decidir e documentar Java 21 ou 25.
   - Corrigir permissão do Maven Wrapper.
   - Corrigir a configuração do Mockito.
   - Criar README e .env.example sem segredo.
   - Documentar OPENAI_API_KEY e BACKEND_URL.
   - Corrigir os metadados “Telegiado” para “Jarvas”.
### 2. Adicionar contexto textual
   - Criar DTO de mensagem com role e content.
   - Alterar /chat para receber o histórico.
   - Adaptar o payload da Responses API para mensagens estruturadas.
   - Adicionar limites e validações.
   - Atualizar testes do serviço e controlador.
   - Manter o campo de texto funcionando.
### 3. Transformar a interface em histórico
   - Substituir response isolada por messages[].
   - Renderizar mensagens de usuário e assistente.
   - Preservar mensagens durante erros.
   - Adicionar “Nova conversa”.
   - Fazer scroll para a mensagem mais recente.
### 4. Implementar transcrição
   - Criar endpoint multipart no backend.
   - Integrar gpt-transcribe.
   - Testar serialização multipart, resposta e erros externos.
   - Acrescentar proxy correspondente no Next.js.
### 5. Implementar gravação
   - Adicionar controle de microfone com iniciar/parar.
   - Detectar suporte a getUserMedia e MediaRecorder.
   - Tratar permissões e dispositivos indisponíveis.
   - Enviar o áudio e inserir a transcrição no fluxo comum da conversa.
### 6. Conectar e controlar a voz de saída
   - Encaminhar /speech no Next.js.
   - Gerar e reproduzir o MP3.
   - Exibir estados de síntese e reprodução.
   - Adicionar repetir/parar áudio e limpeza de recursos.
   - Exibir aviso de que a voz é gerada por IA, exigido pela política documentada da OpenAI.
### 7. Cobrir a interface com testes
   - Testar histórico e envio textual.
   - Testar gravação usando mocks das APIs do navegador.
   - Testar permissão negada.
   - Testar falha independente de transcrição, conversa e síntese.
   - Testar limpeza de URL e interrupção do áudio anterior.
###8. Validação integrada
   - Rodar Maven, lint e build.
   - Testar manualmente microfone em navegador compatível e em contexto seguro (localhost ou HTTPS).
   - Verificar o exemplo Einstein → “Onde ele nasceu?”.
   - Validar texto como alternativa quando o microfone não estiver disponível.

A decisão arquitetural principal que recomendo aprovar é: backend stateless, histórico mantido no navegador e enviado explicitamente em cada turno; gravação por turnos curtos usando MediaRecorder; transcrição, resposta e síntese como três operações separadas. É o menor caminho para entregar a conversa por voz sem antecipar memória permanente ou Realtime.