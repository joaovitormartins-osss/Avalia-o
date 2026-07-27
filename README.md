🚗 FleetCore - Sistema de Gestão de Locadora
📋 Sobre o Projeto
FleetCore é um sistema completo de gestão de locadora de veículos, desenvolvido com HTML, CSS e JavaScript puro, utilizando uma API REST simulada com JSON Server. O sistema oferece uma interface moderna e intuitiva para gerenciar toda a operação de uma locadora.

✨ Funcionalidades
📊 Dashboard
KPIs em tempo real: Veículos disponíveis, em manutenção, clientes totais e locações ativas

Gráfico de evolução mensal: Acompanhamento do faturamento por mês

Rankings de desempenho:

Top 5 carros mais alugados

Top 5 clientes que mais gastam

Locações ativas: Lista com as locações em andamento e atrasadas

Faturamento do período: Somatório de todas as locações

Atalhos rápidos: Acesso direto para criar novos registros

🎯 Catálogo (Carrossel 3D)
Visualização em carrossel 3D estilo Netflix

Filtro por categoria de veículo

Ordenação automática por diária (menor para maior)

Cards com informações principais (status, categoria, preço)

Ação rápida para iniciar locação

Modal com detalhes completos do veículo

🚘 Veículos
Lista completa com todos os veículos

Ordenação automática por diária (menor para maior)

Filtros por status e busca por texto

CRUD completo (criar, editar, inativar, reativar)

Máscaras para placa e ano

👤 Clientes
Cadastro completo com validações

Verificação de idade mínima (21 anos)

Validação de CPF e e-mail

Controle de CNH (vencida, próxima ao vencimento, regular)

Filtros por status e busca por texto

📝 Locações
Registro com validações de negócio:

Cliente deve ter CNH válida

Cliente não pode ter locações em atraso

Utilitários só para CNH D ou E

Veículo deve estar disponível

Cálculo automático do valor

Devolução com registro de quilometragem

Cancelamento de locações

Filtros por status e busca

🔧 Manutenção
Registro de manutenções preventivas e corretivas

Controle de custos

Conclusão de manutenções

Status: Em Andamento / Concluída

🛠️ Tecnologias Utilizadas
Tecnologia	Descrição
HTML5	Estrutura da aplicação
CSS3	Estilização com design tokens e responsividade
JavaScript (ES6+)	Lógica da aplicação
JSON Server	API REST fake para desenvolvimento
SweetAlert2	Alertas e modais interativos
Chart.js	Gráficos e analytics
Font Awesome	Ícones
Google Fonts	Sora, Inter e JetBrains Mono
📦 Estrutura de Arquivos
text
fleetcore/
├── inex.html          # Página principal
├── inex.css           # Estilos da aplicação
├── inex.js            # Lógica da aplicação
├── dados.json         # Banco de dados fake (JSON Server)
└── README.md          # Documentação
