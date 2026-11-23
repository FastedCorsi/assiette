export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];
export const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function el(tag, className = '', text = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== null) element.textContent = text;
  return element;
}

export function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const use = document.createElementNS(ns, 'use');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

export function button(text, className = 'button') {
  const control = el('button', className, text);
  control.type = 'button';
  return control;
}

export function empty(message) {
  return el('p', 'empty', message);
}

export function volume(ml) {
  return ml >= 1000 ? number.format(ml / 1000) + ' L' : number.format(ml) + ' ml';
}
