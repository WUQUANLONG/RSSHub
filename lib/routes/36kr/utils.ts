import got from '@/utils/got';
import { load } from 'cheerio';
import CryptoJS from 'crypto-js';
import {decodeAndExtractText, extractImageUrlsWithCheerio} from "@/utils/parse-html-content";
const rootUrl = 'https://www.36kr.com';

const ProcessItem = (item, tryGet) =>
    tryGet(item.link, async () => {
        const detailResponse = await got({
            method: 'get',
            url: item.link,
        });

        const cipherTextList = detailResponse.data.match(/{"state":"(.*)","isEncrypt":true}/) ?? [];
        let content = ''
        if (cipherTextList.length === 0) {
            const $ = load(detailResponse.body);
            content = $('div.articleDetailContent').html();

        } else {
            const key = CryptoJS.enc.Utf8.parse('efabccee-b754-4c');
            const content = JSON.parse(
                CryptoJS.AES.decrypt(cipherTextList[1], key, {
                    mode: CryptoJS.mode.ECB,
                    padding: CryptoJS.pad.Pkcs7,
                })
                    .toString(CryptoJS.enc.Utf8)
                    .toString()
            ).articleDetail.articleDetailData.data;

            content = content.widgetContent;

        }
        let content_text = decodeAndExtractText(content);
        let content_images = extractImageUrlsWithCheerio(content);
        let articleDetailTmp = {}
        articleDetailTmp.content = content_text;
        articleDetailTmp.content_images = content_images;
        item.description = articleDetailTmp;
        return item;
    });

export { rootUrl, ProcessItem };
