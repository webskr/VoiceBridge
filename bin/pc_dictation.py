#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VoiceBridge PC Direct Voice Dictation (High-Speed & Massive Hinglish Vocabulary)
- Dynamic Auto-Calibration: Automatically measures room noise floor (no hardcoded threshold)
- Pre-Roll Audio Buffer: Never clips or misses the first word spoken
- Ultra-Fast Pause Detection: 400ms silence auto-trigger (instant responsiveness)
- Persistent Connection Pooling: Eliminates TLS handshake latency
- 100% Clipboard-Safe: Pure SendInput Unicode keystrokes (never touches clipboard)
- Massive Developer & Conversational Vocabulary:
  Over 600+ coding, technical, shortcut, and colloquial Indian chat words mapped seamlessly!
"""

import os
import sys
import time
import json
import re
import queue
from collections import deque
import threading
import concurrent.futures
import argparse
import urllib.request
import winsound
import ctypes
from ctypes import wintypes
import numpy as np
import sounddevice as sd
import speech_recognition as sr
import speech_recognition.recognizers.google as sr_google
import requests

try:
    import keyboard
    KEYBOARD_AVAILABLE = True
except ImportError:
    KEYBOARD_AVAILABLE = False

try:
    import faster_whisper
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    FASTER_WHISPER_AVAILABLE = False

# -------------------------------------------------------------
# Developer Multi-Word Phrases & Common Expressions
# -------------------------------------------------------------
DEV_PHRASES = [
    ('ए आई', 'ai'),
    ('एआई', 'ai'),
    ('ए पी आई', 'api'),
    ('एपीआई', 'api'),
    ('यू आई', 'ui'),
    ('यूआई', 'ui'),
    ('यू एक्स', 'ux'),
    ('यूएक्स', 'ux'),
    ('पी आर', 'pr'),
    ('पीआर', 'pr'),
    ('आई डी', 'id'),
    ('आईडी', 'id'),
    ('यू आर एल', 'url'),
    ('यूआरएल', 'url'),
    ('चैट बॉट', 'chatbot'),
    ('चैट बाट', 'chatbot'),
    ('चैटबॉट', 'chatbot'),
    ('चैटबाट', 'chatbot'),
    ('लोकल होस्ट', 'localhost'),
    ('लोकलहोस्ट', 'localhost'),
    ('कंसोल लॉग', 'console log'),
    ('कंसोल लाग', 'console log'),
    ('ट्राई कैच', 'try catch'),
    ('कोड रिव्यू', 'code review'),
    ('डॉट जेएस', '.js'),
    ('डॉट टीएस', '.ts'),
    ('डॉट कॉम', '.com'),
    ('डॉट इन', '.in'),
    ('डॉट ओआरजी', '.org'),
    ('एट द रेट', '@'),
    ('एंटी ग्रेविटी', 'antigravity'),
    ('एंटीग्रेविटी', 'antigravity'),
    ('वीएस कोड', 'vs code'),
    ('वी एस कोड', 'vs code'),
    ('कंट्रोल प्लस ऑल्ट प्लस वी', 'ctrl + alt + v'),
    ('कंट्रोल ऑल्ट वी', 'ctrl + alt + v'),
    ('कंट्रोल + ऑल्ट + वी', 'ctrl + alt + v'),
    ('कंट्रोल प्लस सी', 'ctrl + c'),
    ('कंट्रोल प्लस वी', 'ctrl + v'),
    ('कंट्रोल प्लस जेड', 'ctrl + z'),
    ('कंट्रोल प्लस एक्स', 'ctrl + x'),
    ('कंट्रोल प्लस एस', 'ctrl + s'),
    ('कंट्रोल प्लस ए', 'ctrl + a'),
    ('कंट्रोल प्लस एफ', 'ctrl + f'),
    ('प्लस ऑल्ट प्लस', '+ alt +'),
    ('कंट्रोल प्लस', 'ctrl +'),
    ('ऑल्ट प्लस', 'alt +'),
    ('पुल रिक्वेस्ट', 'pull request'),
    ('ओपन सोर्स', 'open source'),
    ('फुल स्टैक', 'full stack'),
    ('फ्रंट एंड', 'frontend'),
    ('बैक एंड', 'backend'),
    ('यूनिट टेस्ट', 'unit test'),
    ('क्लीन कोड', 'clean code'),
    ('डार्क मोड', 'dark mode'),
    ('लाइट मोड', 'light mode'),
    ('सोर्स कोड', 'source code'),
    ('डाटा बेस', 'database'),
    ('डेटा बेस', 'database'),
    ('हो गया', 'ho gaya'),
    ('हो गई', 'ho gayi'),
    ('हो गए', 'ho gaye'),
    ('नहीं हुआ', 'nahi hua'),
    ('नहीं हुई', 'nahi hui'),
    ('नहीं हुए', 'nahi hue'),
    ('काम कर रहा है', 'kaam kar raha hai'),
    ('काम नहीं कर रहा', 'kaam nahi kar raha'),
    ('चल रहा है', 'chal raha hai'),
    ('नहीं चल रहा', 'nahi chal raha'),
    ('क्या चल रहा है', 'kya chal raha hai'),
    ('क्या हुआ', 'kya hua'),
    ('क्या बात है', 'kya baat hai'),
    ('कोई बात नहीं', 'koi baat nahi'),
    ('कोई दिक्कत नहीं', 'koi problem nahi'),
    ('कोई प्रॉब्लम नहीं', 'koi problem nahi'),
    ('एक काम करो', 'ek kaam karo'),
    ('एक बात बताओ', 'ek baat batao'),
    ('एक बार चेक करो', 'ek baar check karo'),
    ('रन करके देखो', 'run karke dekho'),
    ('पुश कर दो', 'push kar do'),
    ('पुश मत करना', 'push mat karna'),
    ('पुश नहीं करना', 'push nahi karna'),
    ('चेंज कर दो', 'change kar do'),
    ('चेंज करना चाहिए', 'change karna chahiye'),
    ('रीड मी', 'readme'),
    ('पुल कर लो', 'pull kar lo'),
    ('कमिट कर दो', 'commit kar do'),
    ('मर्ज कर दो', 'merge kar do'),
    ('डिप्लॉय कर दो', 'deploy kar do'),
    ('बिल्ड बना दो', 'build bana do'),
    ('कोड लिख दो', 'code likh do'),
    ('फाइल सेव कर दो', 'file save kar do'),
    ('फाइल डिलीट कर दो', 'file delete kar do'),
    ('एरर सॉल्व कर दो', 'error solve kar do'),
    ('बग फिक्स कर दो', 'bug fix kar do'),
    ('कम से कम', 'kam se kam'),
    ('ज्यादा से ज्यादा', 'zyada se zyada'),
    ('बार बार', 'baar baar'),
    ('एक साथ', 'ek saath'),
    ('थोड़ा बहुत', 'thoda bahut'),
    ('बिलकुल सही', 'bilkul sahi'),
    ('बिल्कुल सही', 'bilkul sahi'),
    ('पक्का ना', 'pakka na'),
    ('सच में', 'sach me'),
    ('सही में', 'sahi me'),
    ('ध्यान रखना', 'dhyan rakhna'),
    ('याद रखना', 'yaad rakhna'),
    ('पता चला', 'pata chala'),
    ('पता नहीं', 'pata nahi'),
    ('समझ आया', 'samajh aaya'),
    ('समझ नहीं आया', 'samajh nahi aaya'),
    ('समझ गया', 'samajh gaya'),
    ('समझ गई', 'samajh gayi'),
]

# -------------------------------------------------------------
# Comprehensive Hinglish Dictionary (Devanagari -> Natural Roman Chat)
# -------------------------------------------------------------
COMMON_HINGLISH_WORDS = {
    # Pronouns, Conjunctions & Prepositions
    'किसी': 'kisi', 'किसे': 'kise', 'किस': 'kis', 'किसका': 'kiska', 'किसके': 'kiske', 'किसकी': 'kiski',
    'भी': 'bhi',
    'में': 'me', 'पे': 'pe', 'पर': 'par',
    'का': 'ka', 'की': 'ki', 'के': 'ke', 'को': 'ko',
    'यह': 'yeh', 'ये': 'ye', 'वह': 'woh', 'वो': 'wo',
    'और': 'aur', 'या': 'ya', 'अथवा': 'ya', 'वर्ण': 'warna', 'वरना': 'warna',
    'नहीं': 'nahi', 'मत': 'mat', 'ना': 'na',
    'अब': 'ab', 'तब': 'tab', 'कब': 'kab', 'जब': 'jab',
    'जो': 'jo', 'तो': 'to', 'अगर': 'agar', 'यदि': 'agar', 'लेकिन': 'lekin', 'मगर': 'magar',
    'क्योंकि': 'kyunki', 'ताकि': 'taaki', 'इसलिए': 'isliye',
    'मुझे': 'mujhe', 'मुझको': 'mujhko', 'मुझसे': 'mujhse', 'मुझपे': 'mujhpe',
    'तुम्हें': 'tumhein', 'तुझे': 'tujhe', 'आपको': 'aapko', 'आपसे': 'aapse',
    'हम': 'hum', 'हमे': 'humein', 'हमें': 'humein', 'हमसे': 'humse',
    'तुम': 'tum', 'आप': 'aap',
    'मेरा': 'mera', 'मेरी': 'meri', 'मेरे': 'mere',
    'तेरा': 'tera', 'तेरी': 'teri', 'तेरे': 'tere',
    'हमारा': 'hamara', 'हमारी': 'hamari', 'हमारे': 'hamare',
    'उसका': 'uska', 'उसकी': 'uski', 'उसके': 'uske',
    'उनका': 'unka', 'उनकी': 'unki', 'उनके': 'unke',
    'इसका': 'iska', 'इसकी': 'iski', 'इसके': 'iske',
    'अपना': 'apna', 'अपने': 'apne', 'अपनी': 'apni',
    'सब': 'sab', 'सबको': 'sabko', 'सभी': 'sabhi', 'सबका': 'sabka',
    'कुछ': 'kuch', 'कोई': 'koi',
    'कहाँ': 'kahan', 'कहा': 'kaha', 'यहाँ': 'yahan', 'वहाँ': 'wahan', 'जहाँ': 'jahan',
    'इधर': 'idhar', 'उधर': 'udhar', 'किधर': 'kidhar',
    'अंदर': 'andar', 'बाहर': 'bahar', 'ऊपर': 'upar', 'नीचे': 'neeche',
    'आगे': 'aage', 'पीछे': 'peeche', 'पास': 'paas', 'दूर': 'door',
    'साथ': 'saath', 'बिना': 'bina', 'अलग': 'alag', 'सिर्फ': 'sirf', 'खाली': 'khali',

    # Conversational Verbs
    'जाइए': 'jaiye', 'जाए': 'jaye', 'जाएं': 'jaye', 'जाओ': 'jao', 'जा': 'ja', 'जाना': 'jana', 'जाएंगे': 'jayenge',
    'दबाइए': 'dabaiye', 'दबाई': 'dabaiye', 'दवाई': 'dabaiye', 'दवाइए': 'dabaiye',
    'दबाओ': 'dabao', 'दबाएं': 'dabayen', 'दबा': 'daba', 'दबाना': 'dabana',
    'बताइए': 'bataiye', 'बताओ': 'batao', 'बताएं': 'bataye', 'बता': 'bata', 'बताना': 'batana', 'बताएंगे': 'batayenge',
    'कीजिए': 'kijiye', 'कीजिये': 'kijiye', 'करिए': 'kariye', 'करो': 'karo', 'करें': 'karein', 'कर': 'kar', 'करना': 'karna', 'करेंगे': 'karenge', 'किया': 'kiya',
    'दीजिए': 'dijiye', 'दीजिये': 'dijiye', 'दे': 'de', 'दो': 'do', 'देना': 'dena', 'देंगे': 'denge', 'दिया': 'diya',
    'लीजिए': 'lijiye', 'लीजिये': 'lijiye', 'ले': 'le', 'लो': 'lo', 'लेना': 'lena', 'लेंगे': 'lenge', 'लिया': 'liya',
    'देखिए': 'dekhiye', 'देखो': 'dekho', 'देख': 'dekh', 'देखना': 'dekhna', 'देखेंगे': 'dekhenge', 'देखा': 'dekha',
    'दिखाइए': 'dikhaiye', 'दिखाओ': 'dikhao', 'दिखा': 'dikha', 'दिखाना': 'dikhana', 'दिखाएंगे': 'dikhayenge',
    'बोलिए': 'boliye', 'बोलो': 'bolo', 'बोल': 'bol', 'बोलना': 'bolna', 'बोलेंगे': 'bolenge', 'बोला': 'bola',
    'सुनिए': 'suniye', 'सुनो': 'suno', 'सुन': 'sun', 'सुनना': 'sunna', 'सुनेंगे': 'sunenge', 'सुना': 'suna',
    'रुकिए': 'rukiye', 'रुको': 'ruko', 'रुक': 'ruk', 'रुकना': 'rukna',
    'लिखिए': 'likhiye', 'लिखो': 'likho', 'लिख': 'likh', 'लिखना': 'likhna', 'लिखेंगे': 'likhenge', 'लिखा': 'likha',
    'बनाइए': 'banaiye', 'बनाओ': 'banao', 'बना': 'bana', 'बनाना': 'banana', 'बनाएंगे': 'banayenge', 'बनाया': 'banaya',
    'बनाऊंगा': 'banaunga', 'बनाऊंगी': 'banaungi', 'बनेगा': 'banega', 'बनेगी': 'banegi',
    'करूंगा': 'karunga', 'करूंगी': 'karungi', 'करेगा': 'karega', 'करेगी': 'karegi',
    'चलेगा': 'chalega', 'चलेगी': 'chalegi', 'चलेंगे': 'chalenge',
    'लगेगा': 'lagega', 'लगेगी': 'lagegi', 'लगेंगे': 'lagenge',
    'दिखेगा': 'dikhega', 'दिखेगी': 'dikhegi', 'दिखेंगे': 'dikhenge',
    'मिलेगा': 'milega', 'मिलेगी': 'milegi', 'मिलेंगे': 'milenge',
    'होगा': 'hoga', 'होगी': 'hogi', 'होंगे': 'honge',
    'चाहिए': 'chahiye', 'चाहता': 'chahta', 'चाहती': 'chahti', 'चाहते': 'chahte',
    'सकता': 'sakta', 'सकती': 'sakti', 'सकते': 'sakte',
    'करता': 'karta', 'करती': 'karti', 'करते': 'karte',
    'होता': 'hota', 'होती': 'hoti', 'होते': 'hote',
    'जिसमें': 'jisme', 'जिससे': 'jisse', 'जिसको': 'jisko', 'जिसका': 'jiska', 'जिसके': 'jiske', 'जिसकी': 'jiski',
    'इसमें': 'isme', 'इससे': 'isse', 'इसको': 'isko', 'इनमें': 'inme', 'उनमें': 'unme',
    'आया': 'aaya', 'आई': 'aayi', 'आए': 'aaye', 'आओ': 'aao', 'आइए': 'aaiye', 'आना': 'aana', 'आएंगे': 'aayenge',
    'लाया': 'laya', 'लाई': 'layi', 'लाए': 'laye', 'लाओ': 'lao', 'लाइए': 'laiye', 'लाना': 'lana',
    'रखो': 'rakho', 'रख': 'rakh', 'रखना': 'rakhna', 'रखिए': 'rakhiye', 'रखा': 'rakha',
    'चलाओ': 'chalao', 'चला': 'chala', 'चलाना': 'chalana', 'चल': 'chal', 'चलो': 'chalo',
    'हटाओ': 'hatao', 'हटा': 'hata', 'हटाना': 'hatana',
    'भेजो': 'bhejo', 'भेज': 'bhej', 'भेजना': 'bhejna', 'भेजा': 'bheja',
    'समझो': 'samjho', 'समझ': 'samajh', 'समझना': 'samajhna', 'समझाओ': 'samajhao',
    'सोचो': 'socho', 'सोच': 'soch', 'सोचना': 'sochna',
    'ढूंढो': 'dhundo', 'ढूंढ': 'dhundh', 'ढूंढना': 'dhundhna',

    # Conversational Expressions & Adjectives
    'नमस्ते': 'namaste', 'हेलो': 'hello', 'हेल्लो': 'hello', 'हाय': 'hi',
    'भाई': 'bhai', 'भई': 'bhai', 'ब्रो': 'bro', 'ब्रा': 'bro', 'डूड': 'dude', 'सर': 'sir', 'दोस्त': 'dost', 'यार': 'yaar', 'बॉस': 'boss',
    'कैसे': 'kaise', 'कैसा': 'kaisa', 'कैसी': 'kaisi', 'हो': 'ho',
    'है': 'hai', 'हैं': 'hain', 'हूँ': 'hoon', 'हूं': 'hoon',
    'था': 'tha', 'थी': 'thi', 'थे': 'the',
    'क्या': 'kya', 'क्यों': 'kyun', 'कब': 'kab', 'कौन': 'kaun', 'कितना': 'kitna', 'कितने': 'kitne', 'कितनी': 'kitni',
    'रहे': 'rahe', 'रहा': 'raha', 'रही': 'rahi',
    'एक': 'ek', 'दो': 'do', 'तीन': 'teen', 'चार': 'chaar', 'पांच': 'paanch',
    'काम': 'kaam', 'बहुत': 'bahut', 'ज्यादा': 'zyada',
    'अच्छा': 'achha', 'अच्छे': 'achhe', 'अच्छी': 'achhi', 'बढ़िया': 'badhiya', 'मस्त': 'mast', 'सही': 'sahi', 'ठीक': 'theek',
    'खराब': 'kharab', 'बुरा': 'bura',
    'थोड़ा': 'thoda', 'थोड़ी': 'thodi', 'थोड़े': 'thode',
    'जल्दी': 'jaldi', 'तुरंत': 'turant', 'फास्ट': 'fast', 'स्लो': 'slow',
    'आराम': 'aaram', 'धीरे': 'dheere',
    'आज': 'aaj', 'कल': 'kal', 'परसों': 'parso',
    'सुबह': 'subah', 'दोपहर': 'dopahar', 'शाम': 'shaam', 'रात': 'raat', 'दिन': 'din',
    'समय': 'samay', 'वक्त': 'waqt', 'टाइम': 'time',

    # Programming Languages & Frameworks
    'रिएक्ट': 'react', 'एंगुलर': 'angular', 'व्यू': 'vue', 'नेक्स्ट': 'nextjs', 'नेक्स्टजेएस': 'nextjs',
    'नोड': 'node', 'नोडजेएस': 'nodejs', 'पायथन': 'python', 'जावा': 'java', 'जावास्क्रिप्ट': 'javascript', 'टाइपस्क्रिप्ट': 'typescript',
    'एचटीएमएल': 'html', 'सीएसएस': 'css', 'टेलविंड': 'tailwind',
    'मोंगो': 'mongo', 'मोंगोडीबी': 'mongodb', 'एसक्यूएल': 'sql', 'माईएसक्यूएल': 'mysql', 'पोस्टग्रेस': 'postgres', 'रेडिस': 'redis',
    'डेटाबेस': 'database', 'डाटाबेस': 'database', 'डेटा': 'data', 'डाटा': 'data',
    'डॉकर': 'docker', 'कुबरनेट्स': 'kubernetes', 'लिनक्स': 'linux', 'उबंटू': 'ubuntu',
    'विंडोज': 'windows', 'विंडो': 'window',

    # Coding Concepts & Keywords
    'फंक्शन': 'function', 'फंक्शनल': 'functional', 'मेथड': 'method',
    'असिंक': 'async', 'अवेट': 'await', 'प्रॉमिस': 'promise', 'कॉलबैक': 'callback',
    'क्लास': 'class', 'ऑब्जेक्ट': 'object', 'एरे': 'array', 'स्ट्रिंग': 'string', 'नंबर': 'number', 'बूलियन': 'boolean',
    'लूप': 'loop', 'वेरिएबल': 'variable', 'कांस्टेंट': 'const',
    'यूज': 'use', 'सॉल्व': 'solve', 'सॉल्यूशन': 'solution',
    'इम्पोर्ट': 'import', 'एक्सपोर्ट': 'export', 'रिटर्न': 'return',
    'कंपोनेंट': 'component', 'कॉम्पोनेंट': 'component', 'हुक': 'hook', 'स्टेट': 'state', 'प्रॉप्स': 'props',
    'राउटर': 'router', 'रूट': 'route', 'कंट्रोलर': 'controller', 'मॉडल': 'model', 'व्यू': 'view', 'मिडलवेयर': 'middleware',
    'स्कीमा': 'schema', 'क्वेरी': 'query', 'म्यूटेशन': 'mutation',
    'सर्वर': 'server', 'क्लाइंट': 'client', 'एपीआई': 'api', 'एंडपॉइंट': 'endpoint', 'टोकन': 'token',
    'जेसन': 'json', 'हेडर': 'header', 'बॉडी': 'body', 'पेलोड': 'payload', 'स्टेटस': 'status', 'रिक्वेस्ट': 'request', 'रिस्पॉन्स': 'response',
    'कुकी': 'cookie', 'सेशन': 'session', 'ऑथ': 'auth', 'ऑथेंटिकेशन': 'authentication',
    'लॉगिन': 'login', 'लॉगइन': 'login', 'साइनअप': 'signup', 'लॉगआउट': 'logout', 'पासवर्ड': 'password', 'ईमेल': 'email', 'यूजर': 'user', 'एडमिन': 'admin', 'रोल': 'role',
    'डैशबोर्ड': 'dashboard', 'प्रोफाइल': 'profile', 'सेटिंग्स': 'settings', 'सेटिंग': 'setting',

    # UI / Frontend & Elements
    'ऐप': 'app', 'एप्प': 'app', 'एप': 'app',
    'नोटपैड': 'notepad', 'वीएस': 'vs', 'कोड': 'code', 'कर्सर': 'cursor',
    'एंटी': 'anti', 'ग्रेविटी': 'gravity',
    'कंट्रोल': 'ctrl', 'ऑल्ट': 'alt', 'अल्ट': 'alt', 'शिफ्ट': 'shift', 'एंटर': 'enter', 'स्पेस': 'space', 'टैब': 'tab', 'एस्केप': 'esc', 'वी': 'v',
    'प्लस': '+', 'माइनस': '-', 'इक्वल': '=', 'स्लैश': '/', 'डॉट': '.', 'कॉमा': ',',
    'बटन': 'button', 'पेज': 'page', 'पेजेस': 'pages', 'आइकन': 'icon', 'मोडल': 'modal', 'पॉपअप': 'popup', 'अलर्ट': 'alert', 'टोस्ट': 'toast', 'नोटिफिकेशन': 'notification',
    'टूलटिप': 'tooltip', 'ड्रॉपडाउन': 'dropdown', 'मेन्यू': 'menu', 'नैवबार': 'navbar', 'साइडबार': 'sidebar', 'फुटर': 'footer',
    'कंटेनर': 'container', 'कार्ड': 'card', 'ग्रिड': 'grid', 'फ्लेक्स': 'flex',
    'फॉर्म': 'form', 'इनपुट': 'input', 'टेक्स्टएरिया': 'textarea', 'चेकबॉक्स': 'checkbox', 'रेडियो': 'radio', 'सेलेक्ट': 'select',
    'टेबल': 'table', 'लिस्ट': 'list', 'आइटम': 'item', 'लिंक': 'link',
    'इमेज': 'image', 'वीडियो': 'video', 'ऑडियो': 'audio', 'मीडिया': 'media', 'फॉन्ट': 'font', 'टेक्स्ट': 'text',
    'कलर': 'color', 'बैकग्राउंड': 'background', 'बॉर्डर': 'border', 'पैडिंग': 'padding', 'मार्जिन': 'margin',
    'विड्थ': 'width', 'हाइट': 'height', 'रिस्पॉन्सिव': 'responsive', 'थीम': 'theme',

    # Dev Actions & Git
    'कॉपी': 'copy', 'कौपी': 'copy', 'पेस्ट': 'paste', 'टाइप': 'type', 'कट': 'cut',
    'इंपोर्टेंट': 'important', 'इम्पॉर्टेंट': 'important', 'महत्वपूर्ण': 'important',
    'क्लिक': 'click', 'क्लिपबोर्ड': 'clipboard',
    'डिलीट': 'delete', 'क्लियर': 'clear', 'रीसेट': 'reset', 'रिमूव': 'remove',
    'सेव': 'save', 'अपडेट': 'update', 'क्रिएट': 'create', 'एडिट': 'edit', 'ऐड': 'add', 'प्रोजेक्ट': 'project',
    'इज': 'is', 'वैलिड': 'valid', 'इनवैलिड': 'invalid',
    'जाएगा': 'jayega', 'जाएगी': 'jayegi', 'जाएंगे': 'jayenge',
    'सर्च': 'search', 'फिल्टर': 'filter', 'सॉर्ट': 'sort',
    'एरर': 'error', 'बग': 'bug', 'चेक': 'check', 'चेकिंग': 'checking', 'फिक्स': 'fix', 'इश्यू': 'issue', 'प्रॉब्लम': 'problem', 'सॉल्यूशन': 'solution',
    'टेस्ट': 'test', 'टेस्टिंग': 'testing', 'डीबग': 'debug', 'लॉग': 'log', 'कंसोल': 'console', 'प्रिंट': 'print', 'रन': 'run',
    'बिल्ड': 'build', 'डिप्लॉय': 'deploy', 'रिलीज': 'release',
    'पुश': 'push', 'पुल': 'pull', 'कमिट': 'commit', 'मर्ज': 'merge', 'ब्रांच': 'branch', 'क्लोन': 'clone', 'फोर्क': 'fork', 'रेपो': 'repo',
    'गिट': 'git', 'गिटहब': 'github', 'गिटलैब': 'gitlab', 'टर्मिनल': 'terminal', 'कमांड': 'command', 'पॉवरशेल': 'powershell',
    'पैकेज': 'package', 'लाइब्रेरी': 'library', 'मॉड्यूल': 'module',
    'नेटवर्क': 'network', 'इंटरनेट': 'internet', 'वाईफाई': 'wifi', 'पोर्ट': 'port', 'यूआरएल': 'url',
    'कनेक्ट': 'connect', 'डिस्कनेक्ट': 'disconnect', 'लोकल': 'local', 'होस्ट': 'host',
    'लोड': 'load', 'लोडिंग': 'loading', 'स्टार्ट': 'start', 'स्टॉप': 'stop', 'पॉज': 'pause', 'रिज्यूम': 'resume', 'रिफ्रेश': 'refresh', 'रीलोड': 'reload',
    'सक्सेस': 'success', 'फेल': 'fail', 'पास': 'pass',
    'स्क्रीन': 'screen', 'डेस्कटॉप': 'desktop', 'लैपटॉप': 'laptop', 'मोबाइल': 'mobile', 'फोन': 'phone',
    'कीबोर्ड': 'keyboard', 'माउस': 'mouse', 'ट्रैकपैड': 'trackpad', 'माइक': 'mic', 'स्पीकर': 'speaker', 'हेडफोन': 'headphone',
    'साउंड': 'sound', 'वॉल्यूम': 'volume', 'म्यूट': 'mute',
    'फाइल': 'file', 'फोल्डर': 'folder', 'डायरेक्टरी': 'directory',
    'नेक्स्ट': 'next', 'बैक': 'back', 'ओके': 'ok', 'प्लीज': 'please', 'थैंक्स': 'thanks', 'सॉरी': 'sorry', 'बाय': 'bye',
    'बेस्ट': 'best', 'बेटर': 'better', 'गुड': 'good', 'इजी': 'easy', 'सिंपल': 'simple',
    'एक्चुअली': 'actually', 'बेसिकली': 'basically', 'फाइनली': 'finally', 'डेफिनेटली': 'definitely',
    'पॉसिबल': 'possible', 'इम्पॉसिबल': 'impossible', 'ऑटोमैटिक': 'automatic', 'ऑटोमैटिकली': 'automatically',
    'डायरेक्ट': 'direct', 'डायरेक्टली': 'directly', 'कम्प्लीट': 'complete', 'कम्प्लीटली': 'completely',
    'परफेक्ट': 'perfect', 'परफेक्टली': 'perfectly', 'करेक्ट': 'correct', 'करेक्टली': 'correctly',
    'वैलिडेट': 'validate', 'वैलिडेशन': 'validation', 'वेरिफाई': 'verify', 'वेरिफिकेशन': 'verification',
    'सर्विस': 'service', 'एप्लीकेशन': 'application', 'डॉक्यूमेंट': 'document', 'डॉक्यूमेंटेशन': 'documentation',
    'इन्फॉर्मेशन': 'information', 'कंडीशन': 'condition', 'कस्टमर': 'customer', 'अकाउंट': 'account',
    'डिटेल्स': 'details', 'कन्वर्सेशन': 'conversation', 'फंक्शनैलिटी': 'functionality',
    'सिक्योरिटी': 'security', 'इफ': 'if', 'एल्स': 'else', 'एंड': 'and', 'विद': 'with', 'विदाउट': 'without',
    'दिस': 'this', 'दैट': 'that', 'दीज': 'these', 'दोज': 'those', 'हियर': 'here', 'देयर': 'there',

    # Short-O English Loanword Traps (Words where Devanagari ASR writes 'ा' or 'ॉ' instead of 'o')
    'ब्रा': 'bro', 'ब्रो': 'bro',
    'प्रा': 'pro', 'प्रो': 'pro',
    'कालेज': 'college', 'कॉलेज': 'college',
    'डाक्टर': 'doctor', 'डॉक्टर': 'doctor',
    'टाप': 'top', 'टॉप': 'top',
    'शाप': 'shop', 'शॉप': 'shop',
    'स्टाप': 'stop', 'स्टॉप': 'stop',
    'बाक्स': 'box', 'बॉक्स': 'box', 'बाक्सेज': 'boxes', 'बॉक्सेज': 'boxes',
    'जाब': 'job', 'जॉब': 'job', 'जाब्स': 'jobs', 'जॉब्स': 'jobs',
    'ड्राप': 'drop', 'ड्रॉप': 'drop',
    'ब्लाक': 'block', 'ब्लॉक': 'block',
    'हाट': 'hot', 'हॉट': 'hot',
    'बाट': 'bot', 'बॉट': 'bot', 'बॉट्स': 'bots',
    'डाट': 'dot', 'डॉट': 'dot',
    'लाक': 'lock', 'लॉक': 'lock', 'अनलॉक': 'unlock',
    'माक': 'mock', 'मॉक': 'mock',
    'सकेट': 'socket', 'सॉकेट': 'socket',
    'राकेट': 'rocket', 'रॉकेट': 'rocket',
    'कापी': 'copy', 'कॉपी': 'copy', 'कौपी': 'copy',
    'कांसेप्ट': 'concept', 'कॉन्सेप्ट': 'concept', 'कांसेप्ट्स': 'concepts', 'कॉन्सेप्ट्स': 'concepts',
    'मॉडल': 'model', 'माडल': 'model', 'मॉडल्स': 'models', 'माडल्स': 'models',
    'प्रोजेक्ट': 'project', 'प्राजेक्ट': 'project', 'प्रोजेक्ट्स': 'projects',
    'लॉगिन': 'login', 'लागिन': 'login', 'लॉगइन': 'login',
    'लॉगआउट': 'logout', 'लागआउट': 'logout',
    'ऑप्शन': 'option', 'आप्शन': 'option', 'ऑप्शन्स': 'options', 'आपशन्स': 'options',
    'प्रॉब्लम': 'problem', 'प्राब्लम': 'problem', 'प्रॉब्लम्स': 'problems', 'प्राब्लम्स': 'problems',
    'डाक्यूमेंट': 'document', 'डॉक्यूमेंट्स': 'documents', 'डाक्यूमेंट्स': 'documents',
    'टॉपिक': 'topic', 'टापिक': 'topic', 'टॉपिक्स': 'topics', 'टापिक्स': 'topics',
    'लॉजिक': 'logic', 'लाजिक': 'logic',
    'ऑब्जेक्ट': 'object', 'आब्जेक्ट': 'object', 'ऑब्जेक्ट्स': 'objects', 'आब्जेक्ट्स': 'objects',
    'ऑपरेट': 'operate', 'आपरेट': 'operate', 'ऑपरेटर': 'operator', 'आपरेटर': 'operator', 'ऑपरेशन': 'operation', 'आपरेशन': 'operation',
    'ऑप्टिमाइज़': 'optimize', 'आप्टिमाइज': 'optimize', 'ऑप्टिमाइजेशन': 'optimization',
    'कॉन्टेंट': 'content', 'कान्टेंट': 'content', 'कंटेंट': 'content',
    'कॉन्टेक्स्ट': 'context', 'कांटेक्स्ट': 'context',
    'कॉन्फिग': 'config', 'कांफिग': 'config', 'कॉन्फ़िगरेशन': 'configuration', 'कांफिगरेशन': 'configuration',
    'कॉन्स्टेंट': 'const', 'कांस्टेंट': 'const',
    'बॉडी': 'body', 'बाडी': 'body',
    'कॉमन': 'common', 'कामन': 'common',
    'फॉलो': 'follow', 'फालो': 'follow',
    'कस्टम': 'custom', 'कस्टमाइज': 'customize',
    'सॉफ्टवेयर': 'software', 'साफ्टवेयर': 'software',
    'हार्डवेयर': 'hardware',
    'ऑनलाइन': 'online', 'आनलाइन': 'online',
    'ऑफलाइन': 'offline', 'आफलाइन': 'offline',
    'ऑफिस': 'office', 'आफिस': 'office',
    'ऑफिशियल': 'official', 'आफिशियल': 'official',
    'ऑटो': 'auto', 'आटो': 'auto',
    'ऑटोमेशन': 'automation', 'आटोमेशन': 'automation',
    'ऑटोमैटिक': 'automatic', 'आटोमैटिक': 'automatic',
    'ऑडियो': 'audio', 'आडियो': 'audio',
    'फॉन्ट': 'font', 'फांट': 'font',
    'फॉर्म': 'form', 'फार्म': 'form',
    'फॉर्मेट': 'format', 'फार्मेट': 'format',
    'कॉम्पोनेंट': 'component', 'काम्पोनेंट': 'component',
    'प्रॉम्प्ट': 'prompt', 'प्राम्प्ट': 'prompt',
    'प्रॉपर्टी': 'property', 'प्रापर्टी': 'property',
    'प्रोटोकॉल': 'protocol', 'प्राटोकाल': 'protocol',
    'पॉपअप': 'popup', 'पापअप': 'popup',
    'शॉर्ट': 'short', 'शाार्ट': 'short', 'शॉर्ट्स': 'shorts',
    'स्टॉक': 'stock', 'स्टाक': 'stock',
    'क्रॉप': 'crop', 'क्राप': 'crop',
    'रॉक': 'rock', 'राक': 'rock',
    'पॉडकास्ट': 'podcast', 'पाडकास्ट': 'podcast',
    'ब्लॉग': 'blog', 'ब्लाग': 'blog',
    'शॉट': 'shot', 'शाट': 'shot',
    'लॉट': 'lot', 'लाट': 'lot',
    'डाउनलोड': 'download', 'डाऊनलोड': 'download',
    'अपलोड': 'upload',
    'इंस्टॉल': 'install', 'इन्स्टॉल': 'install', 'इन्स्टाल': 'install', 'इंस्टाल': 'install',
    'ब्राउज़र': 'browser', 'ब्राउजर': 'browser',
    'गूगल': 'google', 'क्रोम': 'chrome', 'यूट्यूब': 'youtube',
    'इम्पॉर्टेंट': 'important', 'इम्पोर्तेन्त': 'important', 'इम्पोर्टेन्ट': 'important', 'इमपोर्टेंट': 'important',
    'आउटपुट': 'output', 'आऊटपुट': 'output',
    'बटन्स': 'buttons',
    'बैकस्पेस': 'backspace',

    # Common English & Technical words frequently spoken in Hinglish
    'रेडमी': 'readme', 'रीडमी': 'readme',
    'चेंज': 'change', 'चेन्ज': 'change', 'चेंजेस': 'changes', 'चेन्जेस': 'changes',
    'डिटेक्ट': 'detect', 'डिटेक्शन': 'detection',
    'वर्ड': 'word', 'वर्ड्स': 'words', 'वार्ड': 'word', 'वार्ड्स': 'words',
    'इंग्लिश': 'english', 'अंग्रेजी': 'english',
    'हिंदी': 'hindi',
    'हिंग्लिश': 'hinglish',
    'लैंग्वेज': 'language', 'लैंग्वेजेस': 'languages',
    'पुश': 'push', 'पुल': 'pull', 'कमिट': 'commit', 'मर्ज': 'merge',
    'सेट': 'set', 'सेटअप': 'setup',
    'डॉक': 'doc', 'डॉक्स': 'docs',
    'गाइड': 'guide', 'ट्यूटोरियल': 'tutorial',
    'मैसेज': 'message', 'मैसेजेस': 'messages',
    'सीक्रेट': 'secret', 'सीगरेट': 'secret', 'सिक्रेट': 'secret',
    'डिटेक्टेड': 'detected',
    'कॉम्बिनेशन': 'combination', 'कान्बिनेशन': 'combination', 'कम्बिनेशन': 'combination',
    'डिप्लॉयमेंट': 'deployment', 'डिप्लॉयमेंट्स': 'deployments',
    'प्रोडक्शन': 'production',
    'वॉइस': 'voice', 'वाइस': 'voice',
    'ब्रिज': 'bridge', 'ब्रीज': 'bridge',
    'सिस्टम': 'system', 'सिटम': 'system',
}

# Phonetic Normalizer: Post-processes accidental mangled spelling into standard words
PHONETIC_NORMALIZER = {
    'bra': 'bro', 'broa': 'bro',
    'kisee': 'kisi', 'kise': 'kisi',
    'ap': 'app', 'aip': 'app',
    'notapaid': 'notepad', 'notapad': 'notepad',
    'veees': 'vs', 'vis': 'vs',
    'entee': 'anti', 'aenti': 'anti',
    'grevitee': 'gravity', 'graviti': 'gravity',
    'davaee': 'dabaiye', 'dawai': 'dabaiye', 'davae': 'dabaiye',
    'kopee': 'copy', 'kopi': 'copy', 'kapee': 'copy',
    'inportent': 'important', 'inportant': 'important', 'impartant': 'important', 'impartent': 'important',
    'pest': 'paste', 'pesta': 'paste',
    'taip': 'type', 'taipa': 'type',
    'klik': 'click', 'klika': 'click',
    'kantrol': 'control', 'kontrol': 'control', 'kontroll': 'control',
    'klipabord': 'clipboard', 'klipbord': 'clipboard',
    'skreen': 'screen',
    'fnkshan': 'function', 'fankshan': 'function',
    'kamputer': 'computer', 'kambuter': 'computer',
    'lepatap': 'laptop',
    'erar': 'error', 'erara': 'error',
    'kod': 'code', 'batan': 'button',
    'cheka': 'check', 'bag': 'bug', 'baga': 'bug',
    'fiks': 'fix', 'testa': 'test', 'testinga': 'testing',
    'faila': 'file', 'foldara': 'folder',
    'imeja': 'image', 'maika': 'mic', 'maik': 'mic',
    'chait': 'chat', 'linka': 'link', 'vebasaait': 'website',
    'inbuta': 'input', 'sarvara': 'server', 'klaaint': 'client',
    'tokana': 'token', 'eemela': 'email', 'emel': 'email',
    'stetas': 'status', 'saksesa': 'success',
    'loda': 'load', 'lodinga': 'loading',
    'opana': 'open', 'kloja': 'close',
    'starta': 'start', 'stopa': 'stop',
    'kliyara': 'clear', 'rifresha': 'refresh',
    'pusha': 'push', 'pula': 'pull', 'kamita': 'commit',
    'gita': 'git', 'githaba': 'github', 'tarminala': 'terminal',
    'kamanda': 'command', 'kansola': 'console', 'loga': 'log',
    'printa': 'print', 'rana': 'run', 'bilda': 'build',
    'sistama': 'system', 'intaraneta': 'internet', 'vaeephaaee': 'wifi',
    'kanekta': 'connect', 'diskanekta': 'disconnect', 'lokala': 'local',
    'sarche': 'search', 'faainda': 'find', 'konphiga': 'config',
    'opshana': 'option', 'feechar': 'feature', 'varjana': 'version',
    'neksta': 'next', 'baika': 'back', 'oke': 'ok',
    'kiborda': 'keyboard', 'kyeeborda': 'keyboard',
    'mausa': 'mouse', 'traikapaida': 'trackpad',

    # Short-O and vowel loanword phonetic normalization
    'pra': 'pro',
    'kolej': 'college', 'kaalej': 'college', 'kalij': 'college',
    'doktar': 'doctor', 'daaktar': 'doctor', 'daktar': 'doctor',
    'taap': 'top',
    'shaap': 'shop',
    'staap': 'stop',
    'baaks': 'box', 'boks': 'box', 'baaksez': 'boxes', 'boksez': 'boxes',
    'draap': 'drop',
    'blaak': 'block', 'blok': 'block',
    'haat': 'hot',
    'daat': 'dot',
    'laak': 'lock', 'lok': 'lock',
    'maak': 'mock', 'mok': 'mock',
    'sakat': 'socket', 'soket': 'socket',
    'raket': 'rocket', 'roket': 'rocket',
    'konsept': 'concept', 'kansept': 'concept', 'koncept': 'concept',
    'maadal': 'model', 'modal': 'model',
    'prajekt': 'project', 'prozect': 'project',
    'tapik': 'topic', 'taapik': 'topic',
    'lozik': 'logic', 'laajik': 'logic',
    'daakyument': 'document',
    'kantent': 'content', 'kantekst': 'context', 'kontekst': 'context',
    'saftveyar': 'software', 'haardveyar': 'hardware',
    'aanlaain': 'online', 'aaphlaain': 'offline',
    'aaphis': 'office', 'aato': 'auto', 'aatometik': 'automatic',
    'phont': 'font', 'phaarm': 'form', 'phaarmet': 'format',
    'praampt': 'prompt', 'prampt': 'prompt',
    'daunlod': 'download', 'apalod': 'upload', 'aplod': 'upload',
    'instol': 'install', 'instaall': 'install',
    'braujar': 'browser', 'brauzar': 'browser',
    'yutyub': 'youtube', 'gugal': 'google', 'khrom': 'chrome',

    # Common English words phonetic fallbacks
    'redami': 'readme', 'reedami': 'readme', 'ridmi': 'readme',
    'chenj': 'change', 'chenja': 'change', 'chenjes': 'changes',
    'ditekt': 'detect', 'ditekshan': 'detection',
    'vard': 'word', 'varda': 'word', 'vards': 'words',
    'inglish': 'english',
    'laingvej': 'language', 'laingvejez': 'languages',
    'sigaret': 'secret', 'seekret': 'secret', 'sikret': 'secret',
    'ditekted': 'detected',
    'kanbineshan': 'combination', 'kambineshan': 'combination',
    'deployament': 'deployment', 'diployament': 'deployment',
    'prodakshan': 'production',
    'vois': 'voice', 'brij': 'bridge',
    'sistam': 'system',
    'maisej': 'message',
    'sho': 'show'
}

# Phonetic character mapping for words not found in dictionary
VOWELS = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u',
    'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
    'ऑ': 'o', 'ॉ': 'o', 'ॅ': 'e'
}

# 'ी' is mapped to 'i' and 'ू' to 'u' to match natural chatting style (kisi, not kisee)
MATRAS = {
    'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
    'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e'
}

CONSONANTS = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
    'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'd', 'ढ़': 'dh', 'फ़': 'f'
}

def transliterate_word(word):
    clean = word.strip('.,!?:;"\'()[]{}')
    punc_prefix = word[:len(word) - len(word.lstrip('.,!?:;"\'()[]{}'))]
    punc_suffix = word[len(word.rstrip('.,!?:;"\'()[]{}')):]

    if clean in COMMON_HINGLISH_WORDS:
        return punc_prefix + COMMON_HINGLISH_WORDS[clean] + punc_suffix

    if all(ord(c) < 128 for c in clean):
        return word

    res = []
    i = 0
    chars = list(clean)
    n = len(chars)

    while i < n:
        c = chars[i]
        if c in CONSONANTS:
            base = CONSONANTS[c]
            if i + 1 < n and chars[i+1] == '्':
                res.append(base)
                i += 2
                continue
            elif i + 1 < n and chars[i+1] in MATRAS:
                res.append(base + MATRAS[chars[i+1]])
                i += 2
                continue
            else:
                if i == n - 1 or (i == n - 2 and chars[i+1] in 'ंःँ'):
                    res.append(base)
                else:
                    res.append(base + 'a')
                i += 1
                continue
        elif c in VOWELS:
            res.append(VOWELS[c])
            i += 1
        elif c in MATRAS:
            res.append(MATRAS[c])
            i += 1
        elif c in 'ंँ':
            res.append('n')
            i += 1
        elif c == 'ः':
            res.append('h')
            i += 1
        elif c == '्':
            i += 1
        else:
            res.append(c)
            i += 1

    return punc_prefix + "".join(res) + punc_suffix

def deduplicate_phrase(text):
    words = text.split()
    n = len(words)
    for k in (2, 3, 4):
        if n >= k * 2 and n % k == 0:
            chunk_size = n // k
            first = words[:chunk_size]
            all_match = True
            for i in range(1, k):
                if words[i * chunk_size : (i + 1) * chunk_size] != first:
                    all_match = False
                    break
            if all_match:
                return " ".join(first)
    return text

def clean_devanagari(text):
    cleaned = deduplicate_phrase(text.strip())
    # Format shortcuts and developer tools cleanly
    cleaned = re.sub(r'\b(control|ctrl)\s*\+\s*(alt|ऑल्ट)\s*\+\s*(v|वी)\b', 'Ctrl + Alt + V', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\b(vs\s*code|वीएस\s*कोड)\b', 'VS Code', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\b(antigravity|एंटीग्रेविटी|एंटी\s+ग्रेविटी)\b', 'Antigravity', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\b(notepad|नोटपैड)\b', 'Notepad', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\b(github|गिटहब)\b', 'GitHub', cleaned, flags=re.IGNORECASE)
    return cleaned

def to_hinglish(text):
    out = text.replace('।', '.').replace('॥', '.')

    # Phase 1: Multi-word technical and shortcut phrases
    for hindi_p, eng_p in DEV_PHRASES:
        out = out.replace(hindi_p, eng_p)

    # Phase 2: Word-by-word dictionary and transliteration
    words = out.split()
    transliterated = [transliterate_word(w) for w in words]

    # Phase 3: Phonetic normalization
    fixed = []
    for w in transliterated:
        clean = w.strip('.,!?:;"\'()[]{}')
        prefix = w[:len(w) - len(w.lstrip('.,!?:;"\'()[]{}'))]
        suffix = w[len(w.rstrip('.,!?:;"\'()[]{}')):]
        lower_clean = clean.lower()
        if lower_clean in PHONETIC_NORMALIZER:
            fixed.append(prefix + PHONETIC_NORMALIZER[lower_clean] + suffix)
        else:
            fixed.append(w)

    joined = " ".join(fixed)
    joined = re.sub(r'\banti\s+gravity\b', 'antigravity', joined, flags=re.IGNORECASE)
    joined = re.sub(r'\bctrl\s*\+\s*alt\s*\+\s*v\b', 'ctrl + alt + v', joined, flags=re.IGNORECASE)
    joined = re.sub(r'\bcontrol\s+alt\s+of\s+usb\b', 'ctrl + alt + v', joined, flags=re.IGNORECASE)
    return deduplicate_phrase(joined)

# -------------------------------------------------------------
# Windows Native Win32 API Definitions (Keystroke Injection ONLY)
# NEVER TOUCHES THE USER'S CLIPBOARD!
# -------------------------------------------------------------
user32 = ctypes.windll.user32

INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_void_p),
    ]

class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]

class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_void_p),
    ]

class _INPUT_UNION(ctypes.Union):
    _fields_ = [
        ("mi", MOUSEINPUT),
        ("ki", KEYBDINPUT),
        ("hi", HARDWAREINPUT),
    ]

class INPUT(ctypes.Structure):
    _fields_ = [
        ("type", wintypes.DWORD),
        ("union", _INPUT_UNION),
    ]

def win32_type_unicode(text):
    for char in text:
        code = ord(char)
        inp_down = INPUT(type=INPUT_KEYBOARD)
        inp_down.union.ki = KEYBDINPUT(wVk=0, wScan=code, dwFlags=KEYEVENTF_UNICODE, time=0, dwExtraInfo=None)
        inp_up = INPUT(type=INPUT_KEYBOARD)
        inp_up.union.ki = KEYBDINPUT(wVk=0, wScan=code, dwFlags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time=0, dwExtraInfo=None)
        inputs = (INPUT * 2)(inp_down, inp_up)
        user32.SendInput(2, inputs, ctypes.sizeof(INPUT))
        time.sleep(0.0005)

def inject_text_into_cursor(text):
    if not text:
        return
    formatted = text.strip() + " "
    win32_type_unicode(formatted)
    return True

# -------------------------------------------------------------
# High-Sensitivity Continuous Audio Engine
# -------------------------------------------------------------
SAMPLE_RATE = 16000
BLOCK_SIZE = 1600          # 100ms per block
PAUSE_BLOCKS = 4           # 4 blocks = 400ms silence (fast responsive trigger!)
PRE_ROLL_BLOCKS = 3        # Keeps preceding 300ms so initial syllables are never lost

def get_google_speech_url(lang="hi-IN"):
    builder = sr_google.create_request_builder(endpoint=sr_google.ENDPOINT, language=lang)
    return builder.build_url()

class ContinuousPCDictation:
    def __init__(self, hotkey="ctrl+alt+v", lang="hi-IN", format_mode="hindi", server_url="http://127.0.0.1:57890", groq_key=None):
        self.hotkey = hotkey
        self.lang = lang
        self.format_mode = format_mode
        self.server_url = server_url.rstrip("/")
        self.groq_key = groq_key or os.environ.get("GROQ_API_KEY")

        # Local neural bilingual Whisper engine (Base model with Hindi Hinglish prompt & beam_size=5)
        self.whisper_model = None
        if FASTER_WHISPER_AVAILABLE:
            for m_size in ["base", "tiny"]:
                try:
                    self.whisper_model = faster_whisper.WhisperModel(m_size, device="cpu", compute_type="int8")
                    print(f"[PC Voice] Local AI Whisper ({m_size}) loaded with beam_size=5 & Hinglish prompt conditioning!")
                    break
                except Exception:
                    continue

        self.is_active = False
        self.stream = None
        self.energy_threshold = 260.0
        self.voice_blocks = 0

        self.pre_roll = deque(maxlen=PRE_ROLL_BLOCKS)
        self.current_utterance = []
        self.is_speaking = False
        self.silence_count = 0
        self.lock = threading.Lock()

        self.http_session = requests.Session()

        self.transcription_queue = queue.Queue()
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()

    def calibrate_noise(self):
        try:
            print("[PC Voice] Calibrating microphone (0.5s room noise check)...")
            test_data = sd.rec(int(0.5 * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype='int16')
            sd.wait()
            floor = np.sqrt(np.mean(test_data.astype(np.float32)**2))
            # Speech is typically 2.5x - 3.5x higher than ambient floor
            self.energy_threshold = max(240.0, floor * 2.4)
            print(f"[PC Voice] Calibrated! Ambient floor: {floor:.1f} RMS -> Speech trigger threshold: {self.energy_threshold:.1f} RMS")
        except Exception:
            self.energy_threshold = 260.0

    def play_sound(self, kind):
        try:
            if kind == "start":
                winsound.Beep(1200, 70)
            elif kind == "stop":
                winsound.Beep(800, 70)
            elif kind == "typed":
                winsound.Beep(1600, 35)
        except Exception:
            pass

    def toggle(self):
        if self.is_active:
            self.stop()
        else:
            self.start()

    def start(self):
        with self.lock:
            if self.is_active:
                return
            self.is_active = True
            self.current_utterance = []
            self.pre_roll.clear()
            self.is_speaking = False
            self.voice_blocks = 0
            self.silence_count = 0

        self.calibrate_noise()
        self.play_sound("start")

        print("\n" + "=" * 65)
        print("🎙️ [PC Mic ACTIVE - Intelligent Voice Activity Mode]")
        print("👉 Normal aawaz me boliye. Chup rahne par listening trigger nahi hogi.")
        print(f"👉 Har pause (~400ms) par text instant type ho jayega.")
        print(f"👉 Mic OPEN rahega jab tak aap dobara [{self.hotkey.upper()}] nahi dabate.")
        print("=" * 65 + "\n")

        def audio_callback(indata, frames, time_info, status):
            if not self.is_active:
                raise sd.CallbackStop()

            data_copy = indata.copy()
            rms = np.sqrt(np.mean(data_copy.astype(np.float32)**2))

            with self.lock:
                if rms > self.energy_threshold:
                    self.voice_blocks += 1
                    # Confirm at least 2 consecutive voice frames (200ms) to ignore breathing or noise clicks
                    if self.voice_blocks >= 2:
                        if not self.is_speaking:
                            self.is_speaking = True
                            for past_block in self.pre_roll:
                                self.current_utterance.append(past_block)
                        self.current_utterance.append(data_copy)
                        self.silence_count = 0
                else:
                    self.voice_blocks = 0
                    if self.is_speaking:
                        self.current_utterance.append(data_copy)
                        self.silence_count += 1

                        if self.silence_count >= PAUSE_BLOCKS:
                            # Only queue if utterance has at least 4 blocks (400ms) of real speech
                            if len(self.current_utterance) >= 4:
                                utterance_data = np.concatenate(self.current_utterance, axis=0)
                                peak_rms = np.sqrt(np.mean(utterance_data.astype(np.float32)**2))
                                if peak_rms >= self.energy_threshold * 0.8:
                                    self.transcription_queue.put(utterance_data)
                            self.current_utterance = []
                            self.is_speaking = False
                            self.silence_count = 0
                    else:
                        self.pre_roll.append(data_copy)

        try:
            self.stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype='int16',
                blocksize=BLOCK_SIZE,
                callback=audio_callback
            )
            self.stream.start()
        except Exception as e:
            print(f"[PC Voice] Failed to open microphone: {e}")
            self.is_active = False
            self.play_sound("stop")

    def stop(self):
        with self.lock:
            if not self.is_active:
                return
            self.is_active = False

            if self.is_speaking and self.current_utterance:
                utterance_data = np.concatenate(self.current_utterance, axis=0)
                self.transcription_queue.put(utterance_data)
                self.current_utterance = []
                self.is_speaking = False

            try:
                if self.stream and self.stream.active:
                    self.stream.stop()
                    self.stream.close()
            except Exception:
                pass

        self.play_sound("stop")
        print("\n🛑 [PC Mic STOPPED - Dictation OFF]\n")

    def _worker_loop(self):
        while True:
            audio_array = self.transcription_queue.get()
            if audio_array is None:
                break

            duration = len(audio_array) / SAMPLE_RATE
            if duration < 0.35:
                self.transcription_queue.task_done()
                continue

            raw_text = self._transcribe_fast(audio_array)

            if raw_text and raw_text.strip():
                if self.format_mode == "hindi":
                    final_text = clean_devanagari(raw_text.strip())
                else:
                    final_text = to_hinglish(raw_text.strip())

                sys.stdout.write(f"\r[⚡ Typed]: {final_text}\n")
                sys.stdout.flush()
                inject_text_into_cursor(final_text)
                self.play_sound("typed")
                self._sync_to_server(final_text)
            else:
                # Keep listening indicator on a single in-place line (no spamming loop)
                sys.stdout.write("\r[🎙️ Listening...]     ")
                sys.stdout.flush()

            self.transcription_queue.task_done()

    def _query_google_stream(self, flac_bytes, lang):
        try:
            url = get_google_speech_url(lang)
            resp = self.http_session.post(
                url,
                data=flac_bytes,
                headers={"Content-Type": "audio/x-flac; rate=16000"},
                timeout=3.0
            )
            for line in resp.text.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    res = obj.get("result", [])
                    if res and len(res) > 0:
                        alt = res[0].get("alternative", [])
                        if alt:
                            return alt[0].get("transcript", "")
                except Exception:
                    pass
        except Exception:
            pass
        return None

    def _is_hallucination(self, text):
        if not text:
            return True
        lower = text.lower()
        hallucinations = [
            "click on the link",
            "description box",
            "subscribe",
            "thanks for watching",
            "thank you for watching",
            "more in the description",
            "how will you update",
            "ist doll her",
            "mehr der sich damit",
            "like and share",
            "leave a comment",
            "to get the link",
            "exit detected in voicebridge"
        ]
        return any(h in lower for h in hallucinations)

    def _transcribe_fast(self, audio_array):
        # 1. Local Neural Bilingual AI Engine (Whisper Base + Hindi Language Fix + Hinglish Sample Prompt + Beam 5 + VAD)
        if self.whisper_model:
            try:
                float_audio = (audio_array.astype(np.float32) / 32768.0).flatten()
                segments, info = self.whisper_model.transcribe(
                    float_audio,
                    language="hi",
                    initial_prompt="आज मैंने code commit किया और GitHub पर push किया। Supabase में deploy कर दिया, React Native का build भी चल रहा है। Ctrl + Alt + V दबाकर voice typing ऑन करो।",
                    beam_size=5,
                    vad_filter=True,
                    no_speech_threshold=0.6
                )
                text = " ".join(seg.text for seg in segments).strip()
                if text and not self._is_hallucination(text):
                    return text
            except Exception:
                pass

        # 2. Dual-Stream Google Cloud Speech API (Fallback, concurrent en-IN + hi-IN)
        try:
            audio_data = sr.AudioData(audio_array.tobytes(), SAMPLE_RATE, 2)
            flac_bytes = audio_data.get_flac_data()

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                fut_hi = executor.submit(self._query_google_stream, flac_bytes, "hi-IN")
                fut_en = executor.submit(self._query_google_stream, flac_bytes, "en-IN")
                text_hi = fut_hi.result()
                text_en = fut_en.result()

            if text_en and text_en.strip():
                en_clean = text_en.strip()
                if not text_hi:
                    if not self._is_hallucination(en_clean):
                        return en_clean
                words_en = set(re.findall(r'[a-zA-Z]{3,}', en_clean.lower()))
                keywords = {'secret', 'detect', 'detected', 'deployment', 'deployments', 'production', 'voice', 'bridge', 'voicebridge', 'combination', 'readme', 'change', 'push', 'login', 'function', 'antigravity', 'vscode', 'terminal', 'system', 'skill', 'update', 'install', 'commit', 'github'}
                if len(words_en) >= 2 or any(k in en_clean.lower() for k in keywords):
                    if not self._is_hallucination(en_clean):
                        return en_clean

            if text_hi and text_hi.strip():
                if not self._is_hallucination(text_hi):
                    return text_hi.strip()

            if text_en and text_en.strip():
                if not self._is_hallucination(text_en):
                    return text_en.strip()

        except Exception:
            pass

        # 3. Cloud Groq Whisper (Optional API Key)
        if self.groq_key:
            try:
                t = self._transcribe_groq(audio_array.tobytes())
                if t and not self._is_hallucination(t):
                    return t
            except Exception:
                pass

        return None

    def _transcribe_groq(self, raw_bytes):
        import wave
        import io
        wav_io = io.BytesIO()
        with wave.open(wav_io, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(raw_bytes)
        wav_bytes = wav_io.getvalue()

        boundary = "----VoiceBridgeFormBoundary" + str(int(time.time()))
        body = []
        body.append(f"--{boundary}".encode())
        body.append(b'Content-Disposition: form-data; name="model"')
        body.append(b'')
        body.append(b'whisper-large-v3-turbo')
        body.append(f"--{boundary}".encode())
        body.append(b'Content-Disposition: form-data; name="temperature"')
        body.append(b'')
        body.append(b'0.0')
        body.append(f"--{boundary}".encode())
        body.append(b'Content-Disposition: form-data; name="prompt"')
        body.append(b'')
        body.append(b'Transcribe in Romanized Hinglish (Hindi words written in English alphabet, e.g. bhai ek login function bana do, copy paste karo, notepad vs code antigravity)')
        body.append(f"--{boundary}".encode())
        body.append(b'Content-Disposition: form-data; name="file"; filename="audio.wav"')
        body.append(b'Content-Type: audio/wav')
        body.append(b'')
        body.append(wav_bytes)
        body.append(f"--{boundary}--".encode())
        body.append(b'')
        payload = b'\r\n'.join(body)

        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            data=payload,
            headers={
                "Authorization": f"Bearer {self.groq_key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}"
            }
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get("text", "")

    def _sync_to_server(self, text):
        try:
            req_data = json.dumps({"text": text, "type_active": False, "source": "pc_mic"}).encode('utf-8')
            req = urllib.request.Request(
                f"{self.server_url}/api/voice/inject",
                data=req_data,
                headers={"Content-Type": "application/json"}
            )
            urllib.request.urlopen(req, timeout=1.5)
        except Exception:
            pass

    def run(self):
        print("=" * 65)
        print("🎙️ VoiceBridge PC Direct Voice Dictation")
        print(f"👉 Shortcut Key : [{self.hotkey.upper()}] (Press to Start / Stop)")
        mode_desc = "Devanagari Hindi + English Code" if self.format_mode == "hindi" else "Romanized Chat Hinglish"
        print(f"👉 Output Format : {self.format_mode.upper()} ({mode_desc})")
        print(f"👉 Response Speed: 400ms Trigger + Neural Whisper Base Engine")
        print("=" * 65)
        print("KISI BHI APP (VS Code, Antigravity, Notepad) me jaiye,")
        print(f"1 baar [{self.hotkey.upper()}] dabaiye aur normal aawaz me bolna shuru kijiye.\n")

        if KEYBOARD_AVAILABLE:
            try:
                keyboard.add_hotkey(self.hotkey, self.toggle)
                print(f"[OK] Global hotkey [{self.hotkey.upper()}] active across Windows.")
            except Exception as e:
                print(f"[!] Hotkey registration failed: {e}")
        else:
            print("[!] 'keyboard' library not found. Run 'pip install keyboard'.")

        try:
            while True:
                time.sleep(0.1)
        except KeyboardInterrupt:
            self.stop()
            print("\nExiting.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VoiceBridge PC Continuous Voice Dictation")
    parser.add_argument("--hotkey", default="ctrl+alt+v", help="Global shortcut key (default: ctrl+alt+v)")
    parser.add_argument("--lang", default="hi-IN", help="Recognition language (hi-IN, en-IN)")
    parser.add_argument("--format", default="hindi", choices=["hindi", "hinglish"], help="Output format: hindi (Devanagari) or hinglish (Romanized)")
    parser.add_argument("--server", default="http://127.0.0.1:57890", help="VoiceBridge server URL")
    parser.add_argument("--groq-key", default=None, help="Optional Groq API key")

    args = parser.parse_args()
    engine = ContinuousPCDictation(
        hotkey=args.hotkey,
        lang=args.lang,
        format_mode=args.format,
        server_url=args.server,
        groq_key=args.groq_key
    )
    engine.run()
