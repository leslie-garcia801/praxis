import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildMe } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/utils';

describe('AlumnoLayout', () => {
  it('RNF-09: the header has the theme selector', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json(buildMe())));
    renderApp('/alumno');
    expect(await screen.findByRole('combobox', { name: 'Tema' })).toBeInTheDocument();
  });
});
