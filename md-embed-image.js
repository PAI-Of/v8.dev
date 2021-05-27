'use strict';

const imageSize = require('image-size');
const { existsSync, readFileSync } = require('fs');
const assert = require('assert');

module.exports = md => {
  md.core.ruler.push('check_img_in_figure', state => {
    let inFigure = false;
    for (const t of state.tokens) {
      switch (t.type) {
        case 'figure_open':
        case 'container_figure_open':
          assert(!inFigure);
          inFigure = true;
          break;
        case 'figure_close':
        case 'container_figure_close':
          assert(inFigure);
          inFigure = false;
          break;
        case 'inline':
          if (!inFigure) {
            const image = t.children.find(t => t.type === 'image');
            if (image) {
              throw new Error(`Image ${image.attrGet('src')} is not in a separate block. Missing newlines around?`);
            }
          }
          break;
      }
    }
    assert(!inFigure);
  });

  // Add a post-process rule for inline items.
  md.inline.ruler2.push('embed_image', state => {
    for (const t of state.tokens) {
      // Skip non-image tokens.
      if (t.type !== 'image') continue;
      let imgSrc = t.attrGet('src');
      // We only embed self-hosted images.
      if (imgSrc.startsWith('/_img/')) {
        const { width, height } = imageSize('src' + imgSrc);
        // Lazify image and embed its sizes to avoid layout jump.
        t.attrs.push(['width', width], ['height', height], ['loading', 'lazy']);
        // Check if `file@2x.ext` exists for `file.ext`.
        const imgSrc2x = imgSrc.replace(/\.[^.]*$/, '@2x$&');
        if (existsSync('src' + imgSrc2x)) {
          // If it does, use it in `srcset` as an alternative variant.
          t.attrs.push(['srcset', `${imgSrc2x} 2x`]);
        }
      } else if (imgSrc.startsWith('/_svg/')) {
        // Ignore, we'll fix this in the embed_svg pass.
      } else {
        throw new Error(`Image ${imgSrc} is not in the "/_img/..." directory.`);
      }
    }
  });

  // Add a post-process rule for inline svgs. This has to be done after implicit
  // figures, else we'd lose the implicit figures for the image.
  md.core.ruler.after('implicit_figures', 'embed_svg', state => {
    for (const t of state.tokens) {
      // Skip non-inline images tokens.
      if (t.type !== 'inline') continue;
      const image = t.children.find(t => t.type === 'image');
      if (!image) continue;
      let imgSrc = image.attrGet('src');
      if (imgSrc.startsWith('/_svg/')) {
        const svgfile = readFileSync('src' + imgSrc, {encoding:"utf8"});
        image.type = 'html_inline';
        image.tag = '';
        image.content = svgfile;
      }
    }
  });
};
