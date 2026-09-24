import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

// New hand-authored semantic cases. Labels stay outside the model workspace.
// All administrative identifiers are arbitrary; the narrative determines the label.
const cases=[
 ['include','Inspectors enter fresh measurements in tunnels without a signal. They need the device to retain those entries and submit them after they return above ground; viewing yesterday’s inspection alone is insufficient.'],
 ['exclude','The regional manager wants to download last month’s signed inspections onto a tablet before travelling. During the trip the documents will only be read, and every edit will continue to happen at the office.'],
 ['include','A field nurse records new visit notes in remote homes where mobile service is absent. The notes should wait on the handheld device and join the shared patient record once reception returns.'],
 ['exclude','The sales team already has working mobile data. Their request is to make the live dashboard refresh more rapidly; they explicitly said disconnected operation is outside the project.'],
 ['review','The coordinator asked for an offline mode for remote teams. The note does not establish whether people only consult existing records or also create new ones, nor how anything should reach the server later.'],
 ['include','Warehouse staff must capture inventory adjustments inside a radio-shielded cold room. The handheld should hold the changes while there and transmit the accumulated adjustments at the loading dock.'],
 ['exclude','A finance analyst works locally on an exported spreadsheet, then emails the finished file to a colleague. There is no requested synchronization back into the source application.'],
 ['exclude','The service should continue computing scheduled reports when the user closes their browser. These are server-side jobs on connected machines; no disconnected device entry is requested.'],
 ['include','Maintenance crews fill out new equipment checklists aboard vessels away from shore coverage. Their entries must survive closing the app and be delivered to the central system when the vessel reconnects.'],
 ['exclude','Technicians need diagrams cached for areas without coverage. They will not annotate or enter measurements there and will continue submitting work orders only after returning to a connected office.'],
 ['include','Door-to-door enumerators change household answers while beyond the cellular footprint. The application should queue those edits locally and reconcile them with the shared survey when connectivity returns.'],
 ['exclude','The customer wants to switch the interface to a darker theme on field tablets. They describe outdoor use but ask for no changes to data entry or connection requirements.'],
 ['review','A pilot participant says the app should retain drafts during travel. It is unclear whether travel includes a disconnected period and whether these drafts are intended to be uploaded later.'],
 ['exclude','A backup agent periodically copies centrally stored documents to another server. Both servers remain connected, and users continue editing only through the online application.'],
 ['include','Farm workers register newly treated plots where there is no reception. The manager wants those registrations stored on the phone and automatically delivered to the farm database near the farmhouse.'],
 ['exclude','The archive team requires permanent local storage of scanned images, deliberately isolated from the network. Uploading or synchronizing those images is expressly excluded.'],
 ['include','Guides sell additional tickets in a valley outside mobile coverage. They want each new sale saved on the reader and posted to the shared booking service after reaching a connected station.'],
 ['exclude','At a festival the readers have constant connectivity. The organizer wants the queue screen to display more orders at once, while retaining the existing online-only sales workflow.'],
 ['include','A conservation team adds wildlife observations during multi-day trips with no network. Once back at headquarters, opening the app should send their stored observations into the central project.'],
 ['exclude','The product owner asks for a printable emergency contact list for hiking groups. Participants will carry paper, make no changes in the software, and no upload is part of the request.'],
 ['review','The note requests later synchronization of records stored on a laptop. It never says the laptop must permit creation or editing while disconnected, so online creation followed by delayed upload remains possible.'],
 ['include','Repair engineers amend parts-used records inside underground utility chambers. The handheld must retain those amendments without a connection and push them to dispatch after the engineer emerges.'],
 ['exclude','The requested feature is batch import of old records from removable drives at headquarters. Operators are online while entering data; it is not a disconnected field-entry workflow.'],
 ['exclude','Auditors need to browse cached reference manuals on aircraft. They explicitly do not need annotations, local form completion, or any changes sent back when they land.'],
 ['include','Mobile laboratory staff enter new specimen labels in a sealed collection area without wireless service. Those labels should remain on the device until it can deliver them to the shared registry.'],
 ['exclude','The user asks for reduced bandwidth when opening large photographs over a slow but functioning connection. Image resizing is the complete request; local edits and deferred submission are not needed.'],
 ['include','Counselors update appointment outcomes at outreach sites with no internet. The tablet should keep a durable queue and transfer the outcomes to the office calendar when the connection is restored.'],
 ['exclude','An integration sends changes from one online cloud system to another every evening. Delayed synchronization is requested, but there is no disconnected client or local data creation.'],
 ['review','The writer asks for local field forms and calls the location remote. They have not specified whether a network connection is unavailable or whether the completed forms should ever be transmitted.'],
 ['exclude','A teacher downloads completed submissions for marking on paper. Marks will be entered into the connected gradebook afterward, rather than entered in an offline application.'],
 ['include','Forestry crews create new hazard reports beyond radio coverage. Reports should persist on the handset through the shift and be sent to the central map when the crew returns to a network.'],
 ['exclude','The support department wants the application available in another language. Its staff remain online and ask for identical data-entry behavior with translated labels.'],
 ['exclude','A design studio edits files on a permanently disconnected workstation. The contract expressly prohibits any later delivery of those edits to a networked service.'],
 ['include','Surveyors revise property measurements at disconnected sites. The client needs local storage of those revisions plus submission to the shared cadastral service once they reconnect.'],
 ['exclude','Drivers should see the last downloaded route when signal disappears. Route editing and delivery updates will remain disabled until a live connection exists.'],
 ['include','Disaster-response volunteers record new supply distributions where communications are absent. Their devices must hold the records and synchronize them with coordination staff when a link becomes available.'],
 ['exclude','The operations team requests better monitoring of a continuously connected database. This is a server observability project and does not introduce a device-side editing workflow.'],
 ['review','The client requested saving forms without internet. There is no statement about subsequent upload or synchronization; the forms may be intended only for permanent local use.'],
 ['exclude','A researcher needs locally generated plots after a dataset has been downloaded. The dataset itself will not be edited and no results are meant to flow back into the application.'],
 ['include','Meter readers add readings in basements without mobile reception. The application should preserve each new reading locally and submit the batch automatically once the reader returns outside.'],
 ['exclude','A purchasing team wants bulk approval while connected so that several requests can be authorized with one click. The request does not involve connection loss or device-local changes.'],
 ['exclude','The director requests read-only snapshots that employees can consult after disconnecting their laptops. The snapshots must remain immutable, including when connectivity is restored.'],
 ['include','Event staff register walk-in attendees at a venue with no internet link. Registrations should stay on each device and be merged into the central attendance list after the event.'],
 ['exclude','The customer asks for immediate uploads of existing locally collected files at a connected kiosk. The application being discussed never creates or edits records while disconnected.'],
 ['include','A geologist annotates newly collected samples while the expedition is beyond satellite service. The annotations must survive restarting the tablet and reach the shared repository after the expedition reconnects.'],
 ['exclude','The team wants to share a cached map by printing it. They do not need changes to the map, device-side data collection, or synchronization with a central map service.'],
 ['review','A salesperson asks to work on quotes without depending on reception. The record does not clarify whether this means viewing prepared quotes or editing them, and says nothing about later submission.'],
 ['exclude','A facilities manager wants forms to remain usable on a wired desktop during planned wireless maintenance. The desktop retains internet access throughout; disconnected operation is not part of this request.'],
];
export const offlineGoal='Find requests that explicitly need users to create or modify application records on a device while disconnected AND later send/synchronize those changes to a shared service. Exclude read-only caching, always-connected workflows and deliberately local-only records. Retain ambiguous records for review rather than assuming missing requirements.';
export const offlineItems=cases.map(([label,text],i)=>({id:`REQ-${String(i+1).padStart(3,'0')}`,text,source:'source-archive.md'}));
export const offlineExpected={include:cases.flatMap(([l],i)=>l==='include'?[offlineItems[i].id]:[]),review:cases.flatMap(([l],i)=>l==='review'?[offlineItems[i].id]:[])};
export const offlineSource=offlineItems.map(x=>`## ${x.id}\n${x.text}`).join('\n\n')+'\n';
export const offlineTask={id:'offline_requirements',files:{'source-archive.md':offlineSource,'review-evidence.md':offlineItems.map(x=>`[${x.id} ${x.source}]\n${x.text}\n`).join('')},prompt:`Review review-evidence.md for this product requirement: ${offlineGoal} Write findings.data as JSON with exactly two arrays, include and review, containing the corresponding REQ identifiers. Write findings.md with one short source-grounded reason for each included or review case. Source identifiers are arbitrary. The full source archive is source-archive.md if evidence is missing; preserve both input files. Excluded requests need not appear in the report. Use evidence, not assumptions.`};
export async function validateOffline(task,cwd){
  const checks=[];for(const name of Object.keys(task.files))checks.push({name:'unchanged:'+name,pass:await readFile(join(cwd,name),'utf8').then(s=>s===task.files[name]).catch(()=>false)});
  try{const r=JSON.parse(await readFile(join(cwd,'findings.data'),'utf8'));for(const k of ['include','review'])checks.push({name:k,pass:Array.isArray(r[k])&&JSON.stringify([...r[k]].sort())===JSON.stringify([...offlineExpected[k]].sort()),found:r[k],expected:offlineExpected[k]});
    const md=await readFile(join(cwd,'findings.md'),'utf8');const ids=[...new Set(md.match(/REQ-\d{3}/g)??[])].sort();checks.push({name:'report_ids',pass:md.length>200&&JSON.stringify(ids)===JSON.stringify([...offlineExpected.include,...offlineExpected.review].sort())});
  }catch(e){checks.push({name:'deliverable',pass:false,error:e.code??e.name});}
  return{pass:checks.every(c=>c.pass),checks};
}
