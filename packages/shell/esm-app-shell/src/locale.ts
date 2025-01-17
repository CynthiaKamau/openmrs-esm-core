import * as i18next from "i18next";
import ICU from "i18next-icu";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import merge from "lodash-es/merge";
import { getConfigInternal } from "@openmrs/esm-framework/src/internal";
import { slugify } from "./load-modules";
declare global {
  interface Window {
    i18next: i18next.i18n;
  }
}

export function setupI18n() {
  window.i18next = i18next.default || i18next;

  const languageChangeObserver = new MutationObserver(() => {
    const reDetect: any = undefined;
    window.i18next
      .changeLanguage(reDetect)
      .catch((e) => console.error("i18next failed to re-detect language", e));
  });

  languageChangeObserver.observe(document.documentElement, {
    attributeFilter: ["lang"],
    attributes: true,
  });

  return window.i18next
    .use(LanguageDetector)
    .use({
      type: "backend",
      init() {},
      read(language, namespace, callback) {
        if (namespace === "translation") {
          callback(Error("can't handle translation namespace"), null);
        } else {
          const app: any = window[slugify(namespace)];

          if (app) {
            if ("get" in app) {
              app
                .get("./start")
                .then((start) => {
                  Promise.all([
                    getImportPromise(start(), namespace, language),
                    getConfigInternal(namespace),
                  ]).then(([json, config]) => {
                    let translations = json ?? {};

                    if (config && "Translation overrides" in config) {
                      const overrides = config["Translation overrides"];
                      if (language in overrides) {
                        translations = merge(translations, overrides[language]);
                      }
                    }

                    callback(null, translations);
                  });
                })
                .catch((err: Error) => {
                  callback(err, null);
                });
            }
          }

          callback(Error(`could not load app for ${namespace}`), null);
        }
      },
    } as i18next.BackendModule)
    .use(initReactI18next)
    .use(ICU)
    .init({
      detection: {
        order: ["querystring", "htmlTag", "localStorage", "navigator"],
        lookupQuerystring: "lang",
      },
      fallbackLng: "en",
    });
}

function getImportPromise(
  module: {
    importTranslation: (language: string) => Promise<Record<string, string>>;
  },
  namespace: string,
  language: string
) {
  if (typeof module.importTranslation !== "function") {
    throw Error(
      `Module ${namespace} does not export an importTranslation function`
    );
  }

  const importPromise = module.importTranslation(`./${language}.json`);

  if (!(importPromise instanceof Promise)) {
    throw Error(
      `Module ${namespace} exports an importTranslation function that does not return a promise. Did you forget to set require.context mode to 'lazy'?`
    );
  }

  return importPromise;
}
