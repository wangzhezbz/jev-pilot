"""Publication plots; install matplotlib separately. No inferred token values."""
import csv,json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
p=Path('docs/reports/validation-20260923');s=json.loads((p/'summary.json').read_text())
rows=[r for r in csv.DictReader((p/'pairs.csv').open()) if r['qualityAcceptedPair']=='True']
models=['gpt-6-astra','gpt-6-sol','gpt-6-luna','gpt-5.6-sol'];colors=['#2457a7','#a64c00','#1f7d60','#8a48a0'];markers={'bug_fix':'o','mixed':'s','incident':'^'}
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'svg.fonttype':'none'})
fig,axs=plt.subplots(1,3,figsize=(14,5.1))
for ax,key,label,scale in zip(axs,['wallMs','totalTokens','uncachedInputTokens'],['Elapsed seconds','GPT total tokens (thousands)','Uncached input tokens (thousands)'],[1000,1000,1000]):
 vals=[float(r[arm+'_'+key])/scale for r in rows for arm in ['fixed','auto']];limit=max(vals,default=1)*1.1
 ax.plot([0,limit],[0,limit],color='#9aa1ad',linestyle='--',linewidth=1,label='Equal')
 for model,color in zip(models,colors):
  for task,marker in markers.items():
   rs=[r for r in rows if r['model']==model and r['task']==task]
   ax.scatter([float(r['fixed_'+key])/scale for r in rs],[float(r['auto_'+key])/scale for r in rs],c=color,marker=marker,s=65,edgecolors='white',linewidths=.5,alpha=.9)
 ax.set(xlim=(0,limit),ylim=(0,limit),xlabel='Fixed medium',ylabel='Jev automatic',title=label);ax.set_aspect('equal');ax.grid(alpha=.14)
 ax.text(.04,.96,'Above line = more time/tokens',transform=ax.transAxes,va='top',fontsize=8,color='#575d67')
fig.suptitle('JevPilot v10 | Matched tasks, preregistered checks passed',fontsize=17,x=.055,ha='left',fontweight='bold')
legend=[Line2D([0],[0],marker='o',color='w',label=m,markerfacecolor=c,markersize=8)for m,c in zip(models,colors)]+[Line2D([0],[0],marker=marker,color='w',label=task,markerfacecolor='#667080',markersize=8)for task,marker in markers.items()]
fig.legend(handles=legend,loc='lower center',ncol=7,frameon=False,bbox_to_anchor=(.5,.075),fontsize=9)
fig.text(.055,.025,f"{len(rows)} complete quality-passed pairs; {s['attemptedRuns']}/{s['plannedRuns']} attempted runs. Failed/incomplete pairs excluded from scatter, retained in raw data.\nSingle macOS host, two repeats per model/task, medium baseline. Not account debit or GUI latency.",fontsize=9,color='#555')
fig.subplots_adjust(left=.055,right=.98,top=.87,bottom=.22,wspace=.32)
fig.savefig(p/'paired-results.svg',bbox_inches='tight');fig.savefig(p/'paired-results.png',dpi=180,bbox_inches='tight');plt.close(fig)
(p/'plot-environment.json').write_text(json.dumps({'matplotlib':matplotlib.__version__,'input':'pairs.csv','missingOrFailedPairs':'excluded visually, present in runs.csv and pairs.csv','jitter':False},indent=2)+'\n')
print('Saved SVG and PNG pair plots')
