// apps/frontend/src/pages/BriefEditor.jsx
// Compatibility shim: legacy routes/components that expect "BriefEditor"
// will render the new NewCampaign flow.

import NewCampaign from './NewCampaign.jsx'

export default function BriefEditor() {
  return <NewCampaign />
}
