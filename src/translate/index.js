'use strict';

const translatorApi = module.exports;
translatorApi.translate = async function (postData) {
  // Edit the translator URL below
  const TRANSLATOR_API = 'http://translator:5000/';
  try {
    const response = await fetch(`${TRANSLATOR_API}/?content=${postData.content}`);
    const data = await response.json();
    if (!data || data.is_english === undefined || data.translated_content === undefined) {
      return [true, postData.content];
    }
    return [data.is_english, data.translated_content];
  } catch (error) {
    return [true, postData.content];
  }
};