import gulp from 'gulp';
import pug from 'gulp-pug';
import mjml from 'mjml';
import { minify as htmlmin } from 'html-minifier-terser';
import rename from 'gulp-rename';
import { deleteAsync } from 'del';
import through2 from 'through2';
import { load } from 'cheerio';
import liveServer from 'live-server';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

// Définir __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Tâche pour supprimer les attributs style vides
const removeEmptyStyles = () => {
  return through2.obj((file, _, cb) => {
    if (file.isBuffer()) {
      const $ = load(file.contents.toString());
      $('[style=""]').removeAttr('style'); // Supprimer les attributs style vides
      file.contents = Buffer.from($.html());
    }
    cb(null, file);
  });
};

// Assurez-vous que le répertoire 'dist' existe
const ensureDistDirectory = async () => {
  try {
    await fs.mkdir('./dist', { recursive: true });
    console.log('Répertoire "dist" créé ou existe déjà.');
  } catch (error) {
    console.error('Erreur lors de la création du répertoire "dist":', error);
  }
};

// Démarrage du serveur Live avec désactivation du cache
const serve = (done) => {
  const params = {
    port: 8080,
    root: path.resolve(__dirname, './dist'),
    open: true,
    file: 'index.html',
    wait: 500,
    logLevel: 2, // Niveau de journalisation (0 = désactivé, 1 = erreurs, 2 = infos, 3 = débogage)
    middleware: [
      (req, res, next) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        next();
      }
    ]
  };
  liveServer.start(params);
  console.log('Serveur Live démarré sur le port', params.port);
  done();
};

// Nettoyage du répertoire 'dist'
const cleanDist = () => {
  return deleteAsync(['./dist/*', '!./dist/images']);
};

// Conversion de Pug à MJML
const pugToMjml = () => {
  return gulp.src('./src/*.pug')
    .pipe(pug({
      pretty: true, // À retirer pour la production
      debug: false, // À retirer pour la production
      compileDebug: false,
      globals: [],
      self: false,
    }))
    .pipe(rename({ extname: '.mjml' }))
    .pipe(gulp.dest('./src/mjml'));
};

// Conversion de MJML à HTML
const mjmlToHtml = () => {
  return gulp.src('./src/mjml/*.mjml')
    .pipe(through2.obj((file, _, cb) => {
      try {
        const mjmlContent = file.contents.toString();
        const result = mjml(mjmlContent, {
          filePath: file.path // Ajout du chemin du fichier pour les imports relatifs
        });

        if (result.errors && result.errors.length) {
          console.error('Erreurs MJML:', result.errors);
          return cb(new Error('Compilation MJML échouée'));
        }

        file.contents = Buffer.from(result.html);
        cb(null, file);
      } catch (error) {
        console.error('Erreur dans le fichier:', file.path);
        console.error(error.message);
        cb(error);
      }
    }))
    .pipe(rename({ extname: '.html' }))
    .pipe(removeEmptyStyles())
    .pipe(gulp.dest('./dist'));
};

// Minification HTML
const minifyHtml = () => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      console.log('Démarrage de la tâche minifyHtml...');
      gulp.src(['./dist/*.html', '!./dist/*.min.html'])
        .pipe(through2.obj(async (file, enc, callback) => {
          if (file.isBuffer()) {
            try {
              const minified = await htmlmin(String(file.contents), {
                collapseWhitespace: true,
                removeComments: false, // Garder false pour les commentaires conditionnels
                removeEmptyAttributes: true,
                minifyCSS: true,
                conservativeCollapse: false, // Changé à false pour minifier plus agressivement
                preserveLineBreaks: false, // Changé à false pour supprimer les sauts de ligne
                processConditionalComments: true, // Changé à true pour traiter les commentaires conditionnels
                minifyJS: true,
                caseSensitive: true, // Important pour les éléments MSO
                keepClosingSlash: true, // Important pour la compatibilité email
                html5: false // Important pour la compatibilité email
              });
              file.contents = Buffer.from(minified);
            } catch (error) {
              console.error(`Erreur lors de la minification du fichier: ${file.path}`, error);
            }
          } else {
            console.warn(`Le fichier n'est pas un buffer: ${file.path}`);
          }
          callback(null, file);
        }))
        .pipe(rename({ suffix: '.min' }))
        .pipe(gulp.dest('dist'))
        .on('end', () => {
          console.log('Tâche minifyHtml terminée.');
          resolve();
        });
    }, 500); // Délai de 500ms
  });
};

// Vérification du poids et des attributs alt
const customFilesize = () => {
  return through2.obj(function (file, _, cb) {
    if (file.isBuffer()) {
      const fileSizeInKB = file.contents.length / 1024;
      const fileName = path.basename(file.path);
      console.log(`${fileName}: ${fileSizeInKB.toFixed(2)} Ko`);
    } else {
      console.warn(`Le fichier n'est pas un buffer: ${file.path}`);
    }
    cb(null, file);
  });
};

const verification = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Démarrage de la tâche de vérification...');
      gulp.src('dist/*.html')
        .pipe(customFilesize())
        .pipe(gulp.dest('dist'))
        .on('end', () => {
          console.log('Tâche de vérification terminée.');
          resolve();
        });
    }, 500); // Délai de 500ms
  });
};

// Surveillance des modifications
const watch = () => {
  gulp.watch('./src/**/*.pug', gulp.series(pugToMjml, mjmlToHtml, minifyHtml, verification));
};

// Tâche par défaut
const defaultTask = gulp.series(
  cleanDist,
  ensureDistDirectory,
  pugToMjml,
  mjmlToHtml,
  (done) => {
    setTimeout(() => {
      gulp.series(minifyHtml, verification, serve, watch)(done);
    }, 500);
  }
);

// Export des tâches
export { serve, verification, cleanDist, pugToMjml, mjmlToHtml, minifyHtml, watch, defaultTask as default };
