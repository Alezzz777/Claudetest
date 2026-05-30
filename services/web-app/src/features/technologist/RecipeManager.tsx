import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recipeApiClient, RecipeDto, RecipeVersionStepDto } from '../../services/api';

type Tab = 'recipes' | 'publish-version';

export default function RecipeManager(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('recipes');

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Recipe Manager</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['recipes', 'publish-version'] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px',
            background: activeTab === tab ? '#1976d2' : '#fff',
            color: activeTab === tab ? '#fff' : '#333',
            border: '1px solid #1976d2',
            borderRadius: 4,
            cursor: 'pointer',
          }}>
            {tab === 'recipes' ? 'Recipes' : 'Publish Version'}
          </button>
        ))}
      </div>

      {activeTab === 'recipes' && <RecipesTab />}
      {activeTab === 'publish-version' && <PublishVersionTab />}
    </div>
  );
}

function RecipesTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: recipes, isLoading, error } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => recipeApiClient.listRecipes(),
  });

  const obsoleteMutation = useMutation({
    mutationFn: (recipeId: string) => recipeApiClient.obsoleteRecipe(recipeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {String(error)}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Recipes</h2>
        <button onClick={() => setShowCreate(true)} style={{ padding: '8px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Create Recipe
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Product Code', 'Current Version', 'Status', 'Actions'].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(recipes ?? []).map((recipe) => (
            <tr key={recipe.recipeId}>
              <td style={tdStyle}><strong>{recipe.productCode}</strong></td>
              <td style={tdStyle}>{recipe.currentVersion ?? '—'}</td>
              <td style={tdStyle}><StatusBadge status={recipe.status} /></td>
              <td style={tdStyle}>
                {recipe.status !== 'OBSOLETE' && (
                  <button
                    onClick={() => obsoleteMutation.mutate(recipe.recipeId)}
                    disabled={obsoleteMutation.isPending}
                    style={{ padding: '4px 10px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                  >
                    Obsolete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(recipes ?? []).length === 0 && <div style={{ color: '#666', marginTop: 16 }}>No recipes found.</div>}

      {showCreate && (
        <CreateRecipeModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['recipes'] });
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function CreateRecipeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }): React.ReactElement {
  const [productCode, setProductCode] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => recipeApiClient.createRecipe({ productCode, description }),
    onSuccess: onCreated,
    onError: (e) => setError(String(e)),
  });

  return (
    <Modal title="Create Recipe" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Product Code"><input value={productCode} onChange={(e) => setProductCode(e.target.value)} style={inputStyle} /></Field>
        <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} /></Field>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !productCode} style={{ padding: '8px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {mutation.isPending ? 'Creating...' : 'Create'}
        </button>
      </div>
    </Modal>
  );
}

function PublishVersionTab(): React.ReactElement {
  const queryClient = useQueryClient();
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [version, setVersion] = useState('');
  const [steps, setSteps] = useState<RecipeVersionStepDto[]>([{ stepNo: 1, name: '', workCenterId: '', durationMinutes: 0 }]);
  const [result, setResult] = useState('');

  const { data: recipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => recipeApiClient.listRecipes(),
  });

  const mutation = useMutation({
    mutationFn: () => recipeApiClient.publishVersion(selectedRecipeId, { version, steps }),
    onSuccess: () => {
      setResult(`Version "${version}" published successfully.`);
      void queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
    onError: (e) => setResult(`Error: ${String(e)}`),
  });

  function addStep() {
    setSteps((prev) => [...prev, { stepNo: prev.length + 1, name: '', workCenterId: '', durationMinutes: 0 }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepNo: i + 1 })));
  }

  function updateStep(index: number, field: keyof RecipeVersionStepDto, value: string | number) {
    setSteps((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>Publish Version</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Recipe">
          <select value={selectedRecipeId} onChange={(e) => setSelectedRecipeId(e.target.value)} style={inputStyle}>
            <option value="">Select recipe...</option>
            {(recipes ?? []).map((r) => <option key={r.recipeId} value={r.recipeId}>{r.productCode} ({r.status})</option>)}
          </select>
        </Field>

        <Field label="Version"><input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 1.0.0" style={inputStyle} /></Field>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>Steps</strong>
            <button onClick={addStep} style={{ padding: '4px 12px', background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>+ Add Step</button>
          </div>
          {steps.map((step, i) => (
            <div key={i} style={{ border: '1px solid #e0e0e0', borderRadius: 4, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: '#1976d2', minWidth: 32 }}>#{step.stepNo}</span>
                <button onClick={() => removeStep(i)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#f44336', fontSize: 16 }}>×</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Field label="Name"><input value={step.name} onChange={(e) => updateStep(i, 'name', e.target.value)} style={inputStyle} /></Field>
                <Field label="Work Center ID"><input value={step.workCenterId} onChange={(e) => updateStep(i, 'workCenterId', e.target.value)} style={inputStyle} /></Field>
                <Field label="Duration (min)"><input type="number" value={step.durationMinutes} onChange={(e) => updateStep(i, 'durationMinutes', Number(e.target.value))} style={inputStyle} /></Field>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !selectedRecipeId || !version || steps.length === 0}
          style={{ padding: '10px 16px', background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          {mutation.isPending ? 'Publishing...' : 'Publish Version'}
        </button>

        {result && (
          <div style={{ padding: 12, background: result.startsWith('Error') ? '#ffebee' : '#e8f5e9', borderRadius: 4, color: result.startsWith('Error') ? '#c62828' : '#2e7d32' }}>
            {result}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const colors: Record<string, string> = { DRAFT: '#9e9e9e', APPROVED: '#388e3c', OBSOLETE: '#d32f2f' };
  return (
    <span style={{ background: colors[status] ?? '#9e9e9e', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
      {status}
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, minWidth: 360, maxWidth: 480, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <label>
      <div style={{ fontSize: 13, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

const thStyle: React.CSSProperties = { padding: '8px 12px', background: '#f5f5f5', border: '1px solid #e0e0e0', textAlign: 'left', fontSize: 13 };
const tdStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #e0e0e0', fontSize: 13 };
const inputStyle: React.CSSProperties = { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' };
