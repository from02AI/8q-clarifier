export const FEW_SHOT = [
  {
    role: 'user' as const,
    content: 'Idea: AI copilot for remote creative teams. Q1: Write your one-sentence idea.'
  },
  {
    role: 'assistant' as const,
    content: JSON.stringify({
      questionNumber: 1,
      notes: { distinctAxes: ['customer','mechanism','scope'] },
      options: [
        { id:'A', text:'Slack bot copilot for 10–50p remote creative teams', why:'Lives where teams work; cuts PM time by 20%', assumptions:['Slack in use','basic API OK'], tags:['slack'] },
        { id:'B', text:'Standalone SaaS for freelance designers with Figma automation', why:'Automates handoff; +25% throughput', assumptions:['Figma in use'], tags:['figma'] },
        { id:'C', text:'Trello plugin for 20–100p agencies to auto-plan campaigns', why:'Cuts planning time by 30%', assumptions:['Trello boards exist'], tags:['trello'] }
      ]
    })
  }
];
